
## Diagnóstico do travamento (o que eu consegui observar)

Pelo comportamento descrito (“ainda travando”), e pelo padrão do seu sistema, esse travamento quase sempre acontece quando alguma dessas etapas fica “pendurada” sem resolver:

1) **Checagem de sessão do admin (Global Admin)**  
   - A tela “Verificando permissões…” depende de `useAdminAuth()` terminar.
   - Hoje `useAdminAuth()` **não tem timeout de segurança** como o `useAuth()` (que já tem 10s).  
   - Se por qualquer motivo a chamada de sessão (`getSession`) ou a sequência de checagens ficar presa (rede instável, cache/token corrompido, bloqueio do navegador etc.), o `loading` pode ficar `true` para sempre e a UI fica travada.

2) **Proteção de sessão por dispositivo/abas (TabSession/DeviceSession)**  
   - A proteção por empresa que implementamos depende de buscar `law_firm_id` e chamar RPCs de sessão por dispositivo.
   - Se `law_firm_id` estiver `null` em algum cenário (principalmente contas admin globais / perfis incompletos), há risco de:
     - a RPC ficar fazendo inserts repetidos (porque `UNIQUE` com `NULL` não conflita),
     - ou a lógica nunca “enxergar” conflitos (comparação `=` com `NULL` nunca bate),
     - o que pode degradar e causar comportamentos estranhos (inclusive “parecer travado”).

3) **Preview domain / multi-tenant**
   - A correção do preview domain foi aplicada, mas isso **não resolve** travamentos causados por auth/admin/device-session.
   - Além disso, em preview você pode ter usuários que exigem subdomínio e o sistema pode bloquear (isso não é “travamento”, mas pode parecer).

## Objetivo da correção

- Parar o “loading infinito” no **/global-admin**.
- Garantir que a proteção por dispositivo **não derrube** o painel global e não gere efeitos colaterais.
- Fazer isso sem quebrar o restante do projeto (conversas, kanban, agenda etc.).

---

## Plano de correção (sem regressão)

### Fase 1 — “Destravar” o Global Admin com timeout e estado de erro
**Mudança:** adicionar ao `useAdminAuth.tsx` o mesmo conceito do `useAuth.tsx`:  
- um **timeout de inicialização** (ex.: 10s) que garante que `loading` vira `false` mesmo se `getSession()` ou o listener ficarem presos;
- guardar um `error`/`stuckReason` opcional no contexto, para a UI mostrar mensagem amigável (ex.: “Não foi possível validar a sessão, tente recarregar”).

**Como implementar (alto nível):**
- Criar `ADMIN_AUTH_INIT_TIMEOUT_MS = 10000`.
- Usar `Promise.race` ou um `setTimeout` que chama `setLoading(false)` e zera `user/session/adminRole`.
- Garantir que `setLoading(false)` seja chamado **uma única vez** (flag `finishedRef`), como no `useAuth`.

**Arquivos:**
- `src/hooks/useAdminAuth.tsx`
- (opcional) `src/components/auth/GlobalAdminRoute.tsx` para exibir uma tela de erro se `useAdminAuth` reportar falha.

**Resultado esperado:**  
Mesmo que o backend/autenticação trave, o usuário não fica preso em “Verificando permissões…”. Ele cai para login ou recebe uma tela com “Tentar novamente”.

---

### Fase 2 — Blindar a proteção por dispositivo para não quebrar admin/global
Aqui temos duas estratégias seguras; vou implementar a **mais conservadora** para não mexer em muita coisa:

#### Estratégia recomendada: desabilitar DeviceSession/TabSession no painel global
**Mudança:** no `TabSessionContext.tsx`, detectar se a rota atual começa com `/global-admin` e:
- não inicializar BroadcastChannel,
- não rodar `useDeviceSession`,
- não mostrar diálogos de conflito/duplicidade no painel global.

**Por que é seguro:**  
A regra “1 dispositivo por empresa” faz sentido no app do cliente. O painel global é operacional e não deve sofrer impacto por `law_firm_id` ou sessão por empresa.

**Arquivo:**
- `src/contexts/TabSessionContext.tsx`

**Resultado esperado:**  
Mesmo que exista algum problema de `law_firm_id`/RPC de sessão, o painel global não trava por causa disso.

---

### Fase 3 — Corrigir o caso `law_firm_id = NULL` na proteção por dispositivo (evitar “efeitos fantasma”)
Mesmo com a Fase 2, ainda é importante corrigir a base para não acumular lixo e não afetar usuários edge-case.

**Mudança no backend (migração SQL):**
1) Nas funções RPC:
   - se `_effective_law_firm_id` for `NULL`, **não inserir** sessão e retornar `allowed=true` (ou retornar `allowed=true` + um campo indicando “skipped”).
2) Para comparação, evitar `law_firm_id = NULL`:
   - se em algum ponto precisar comparar nullable, usar `IS NOT DISTINCT FROM` (quando fizer sentido).
3) Opcional: limpar dados ruins existentes:
   - backfill de `law_firm_id` em `user_device_sessions` quando possível via `profiles`,
   - remover duplicatas antigas com `law_firm_id is null` (se existirem em excesso).

**Arquivo:**
- nova migração em `supabase/migrations/*_device_sessions_null_lawfirm_fix.sql`

**Resultado esperado:**  
Não haverá explosão de linhas com `law_firm_id NULL`, nem comportamento imprevisível. A proteção fica estável.

---

## Checklist de testes (obrigatório para não quebrar)

### Testes do Painel Global
1) Abrir `/global-admin` no preview:
   - deve **carregar** (sem “Verificando permissões…” infinito).
2) Forçar um cenário ruim (ex.: abrir em aba anônima / com rede lenta):
   - em até 10s, deve cair para login ou mostrar erro amigável.
3) Login e navegação entre páginas do painel:
   - Dashboard, Empresas, Conexões, etc.

### Testes do App do Cliente (multi-tenant)
4) Login normal no app do cliente (tenant) e navegação:
   - Dashboard, Conversas, Kanban, Agenda Pro.
5) Proteção “1 dispositivo por empresa”:
   - mesmo usuário + mesma empresa em 2 navegadores: deve bloquear/mostrar conflito.
6) Mesmo usuário em empresas diferentes:
   - deve permitir (o requisito original).

### Sanidade
7) Recarregar a página e garantir que não existem loops de redirect.
8) Verificar que não houve regressão nos providers (RealtimeSync, TenantProvider).

---

## Entregáveis (o que vou alterar quando você pedir para executar)
- Ajustes em `useAdminAuth` para timeout + fallback (fim do loading infinito).
- Bypass de TabSession/DeviceSession em rotas `/global-admin`.
- Migração SQL para tornar RPCs tolerantes a `law_firm_id` nulo e (opcional) limpeza/backfill.

---

## Se você quiser que eu continue agora
Posso seguir para implementar essas correções imediatamente em um novo pedido (sem usar mais ferramentas aqui, como solicitado). Se você puder, me diga apenas:
- O travamento acontece **só** no `/global-admin` ou também no app do cliente (`/dashboard`)?
- A mensagem na tela é “Verificando permissões…” ou “Verificando acesso…”?
