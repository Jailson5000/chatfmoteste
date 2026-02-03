# Plano de Correção: Sistema Travando - IMPLEMENTADO ✅

## Status: CONCLUÍDO

As 3 fases foram implementadas com sucesso.

---

## Fase 1 ✅ — Timeout no useAdminAuth

**Arquivo modificado:** `src/hooks/useAdminAuth.tsx`

Alterações:
- Adicionado `ADMIN_AUTH_INIT_TIMEOUT_MS = 10000` (10 segundos)
- Adicionado `initFinishedRef` para garantir que loading só seja setado false uma vez
- Adicionado estado `error` para armazenar mensagens de erro
- Timeout dispara `finishInit()` se a inicialização não completar em 10s

**Arquivo modificado:** `src/components/auth/GlobalAdminRoute.tsx`

Alterações:
- Exibe tela de erro com botão "Tentar novamente" se `useAdminAuth` reportar falha

---

## Fase 2 ✅ — Bypass de TabSession em /global-admin

**Arquivo modificado:** `src/contexts/TabSessionContext.tsx`

Alterações:
- Adicionado `useLocation()` para detectar rota atual
- Se `location.pathname.startsWith("/global-admin")`, a proteção de sessão é desabilitada:
  - Não inicializa BroadcastChannel
  - Não roda `useDeviceSession`
  - Não mostra diálogos de conflito/duplicidade

---

## Fase 3 ✅ — RPCs tolerantes a law_firm_id NULL

**Migração SQL executada**

Funções atualizadas:
- `check_device_session`: Se `law_firm_id` for NULL, retorna `allowed=true` com `skipped=true`
- `invalidate_other_sessions`: Se `law_firm_id` for NULL, retorna 0 sem fazer alterações
- `clear_device_session`: Se `law_firm_id` for NULL, retorna true sem fazer alterações

Limpeza:
- Removidas sessões órfãs com `law_firm_id IS NULL` criadas há mais de 7 dias
- Criado índice `idx_user_device_sessions_active_lookup` para performance

---

## Avisos de Segurança Pré-existentes

Os seguintes avisos foram detectados pelo linter, mas **NÃO foram criados por esta migração**:

1. **Security Definer View** - View pré-existente no sistema
2. **Leaked Password Protection Disabled** - Configuração de auth (recomendado ativar no Supabase)

---

## Próximos Passos

1. Testar acesso ao `/global-admin` no preview
2. Verificar se o loading infinito foi resolvido
3. Testar login/navegação normal no app do cliente
4. Considerar ativar "Leaked Password Protection" nas configurações de auth
