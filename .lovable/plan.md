

# Plano: Incluir Tabelas Internas (auth, storage) no Export

## Contexto

Atualmente o export só acessa tabelas do schema `public` via REST API. As tabelas internas (`auth.users`, `storage.objects`, etc.) não são acessíveis pelo client REST do Supabase.

## O que é possível exportar

| Schema | Método | Tabelas |
|---|---|---|
| `public` (91 tabelas) | REST API (`service_role`) | ✅ Já funciona |
| `auth.users` | `supabase.auth.admin.listUsers()` | ✅ Possível via Admin API |
| `storage.buckets` | `supabase.storage.listBuckets()` | ✅ Possível via Storage API |
| `storage.objects` | `supabase.storage.from(bucket).list()` | ✅ Possível via Storage API |
| `auth.sessions`, `auth.refresh_tokens`, etc. | Sem API disponível | ❌ Não acessível |
| `realtime`, `cron`, `vault`, `net` | Sem API disponível | ❌ Não acessível |

## Implementação

### Edge Function `export-database` — adicionar 2 novas actions:

1. **`export-auth-users`**: Usa `supabase.auth.admin.listUsers()` com paginação para exportar todos os usuários (incluindo metadados, email, phone, created_at, etc.). Exclui campos ultra-sensíveis como `encrypted_password` que a Admin API não retorna.

2. **`export-storage`**: Usa `supabase.storage.listBuckets()` + `supabase.storage.from(bucket).list()` para exportar metadados de todos os arquivos. Opcionalmente pode baixar os arquivos em si (mas isso aumenta muito o tamanho do ZIP).

3. **Atualizar `list`**: Incluir seção separada com contagem de auth users e storage objects.

### Frontend `GlobalAdminExport.tsx`:

- Adicionar seção "Tabelas Internas" separada das públicas
- Mostrar `auth.users` com contagem e botão de export individual
- Mostrar `storage.objects` com contagem por bucket
- Incluir ambos no "Exportar Tudo"
- Os JSONs ficam no ZIP como `_auth_users.json` e `_storage_objects.json`

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/export-database/index.ts` | Adicionar actions `export-auth-users` e `export-storage` |
| `src/pages/global-admin/GlobalAdminExport.tsx` | Adicionar seção de tabelas internas |

### Segurança
- Mesma validação de `super_admin` já existente
- Dados de auth users são sensíveis mas o destino é migração interna
- A Admin API do Supabase **não** retorna password hashes (apenas metadados)

### Limitação importante
- **Password hashes** (`encrypted_password`) não são acessíveis via API — apenas via `pg_dump` direto. Isso significa que os usuários exportados terão que redefinir senhas no ambiente novo, a menos que se obtenha o dump via suporte.

