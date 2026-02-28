

## Plano: Vincular e-mail como Admin Global

Aguardando confirmação do e-mail e nível de acesso desejado.

### O que será feito

1. **Verificar se o e-mail já existe** no `auth.users` — se sim, apenas vincular como admin; se não, criar o usuário
2. **Criar registro em `admin_profiles`** com os dados do usuário
3. **Criar registro em `admin_user_roles`** com a role escolhida (super_admin, admin_operacional ou admin_financeiro)

### Implementação

- Executar INSERTs diretos nas tabelas `admin_profiles` e `admin_user_roles` usando o `user_id` existente
- Se o usuário não existir, usar a Edge Function `create-global-admin` para criar conta + perfil + role de uma vez

### Pré-requisito

Preciso que o usuário informe:
1. Qual e-mail usar
2. Qual nível de acesso (super_admin recomendado para acesso total)
3. Se for conta nova: uma senha para o login

