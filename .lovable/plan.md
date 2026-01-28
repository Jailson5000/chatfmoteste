

# Correção: Ver Usuários de Empresas no Admin Global

## Problemas Identificados

### 1. Contagem do Dashboard
Analisei os dados:
- Total no banco: 12 perfis distribuídos em 7 empresas
- `company_usage_summary` mostra corretamente: FMO=2, Jr=2, Liz=1, Miau=1, Miau test=1, Suporte=1, Formulário=0
- Dashboard soma `current_users` de cada empresa = totais corretos

**Resultado: As contagens estão CORRETAS.**

### 2. Ver Usuários - NÃO FUNCIONA

**Causa Raiz**: As políticas RLS na tabela `profiles` e `user_roles` restringem visualização apenas ao mesmo `law_firm_id`:

```sql
-- Política atual em profiles:
SELECT: (law_firm_id = get_user_law_firm_id(auth.uid()))

-- Política atual em user_roles:
SELECT: EXISTS (... AND p.law_firm_id = get_user_law_firm_id(auth.uid()))
```

Isso significa que mesmo Admin Global não consegue ver perfis de outras empresas, pois não há exceção para `is_admin(auth.uid())`.

---

## Solução: Atualizar RLS para Permitir Admin Global

### Migração SQL

```sql
-- 1. Adicionar política para Admin Global ver TODOS os profiles
DROP POLICY IF EXISTS "Global admins can view all profiles" ON public.profiles;
CREATE POLICY "Global admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- 2. Adicionar política para Admin Global ver TODOS os user_roles
DROP POLICY IF EXISTS "Global admins can view all user roles" ON public.user_roles;
CREATE POLICY "Global admins can view all user roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));
```

### Fluxo Corrigido

```text
Admin Global clica "Ver Usuários" da empresa "Jr"
     │
     ▼
CompanyUsersDialog abre com law_firm_id = "7cd827bc-..."
     │
     ▼
Query: SELECT * FROM profiles WHERE law_firm_id = "..."
     │
     ├── Política antiga: BLOCKED (usuário não pertence a Jr)
     │
     └── Com nova política: is_admin(auth.uid()) = true → ALLOWED
     │
     ▼
Mostra 2 usuários da empresa Jr
```

---

## Segurança

A função `is_admin()` é `SECURITY DEFINER` e verifica a tabela `admin_user_roles`:

```sql
-- Função existente (segura)
CREATE FUNCTION is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_user_roles WHERE user_id = _user_id
  )
$$;
```

Isso garante que apenas usuários na tabela `admin_user_roles` (Admin Global) podem acessar todos os profiles.

---

## Testes Recomendados

1. Logar como Admin Global
2. Ir em Empresas → Ações → "Ver Usuários"
3. Verificar se lista mostra usuários da empresa selecionada
4. Verificar que atendente comum NÃO consegue ver usuários de outras empresas

