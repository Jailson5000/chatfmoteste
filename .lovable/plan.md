
# Diagnóstico: Envio de Email e Erro no Pagamento

## Problema 1: Email de Acesso Mostra "Erro" (Badge Vermelha)

### Causa Raiz
O erro acontece porque o email `miautest03@gmail.com` **já existe** no sistema (usuario já cadastrado anteriormente).

Quando o sistema tenta criar o trial novamente:
1. A Edge Function `create-company-admin` tenta criar um novo usuário
2. Supabase Auth retorna erro: `"A user with this email address has already been registered"`
3. O sistema salva `initial_access_email_error: "Failed to create user"`
4. Badge mostra "Erro"

**Log do erro:**
```
[register-company] Admin creation failed: {
  error: "Failed to create user",
  details: "A user with this email address has already been registered"
}
```

**Situação atual no banco:**
- Empresa: `Miau test` (id: 93e0ce06-...)
- Email: `miautest03@gmail.com`
- `initial_access_email_sent`: false
- `initial_access_email_error`: "Failed to create user"

### Solução
Existe botão "Reenviar Email" no Admin Global. Porém, para esse caso específico o usuário admin já existe - precisa usar esse usuário existente, não criar um novo.

A solução permanente seria detectar que o email já existe e **vincular** ao usuário existente em vez de tentar criar um novo.

---

## Problema 2: Erro "Edge Function returned a non-2xx status code" no Checkout

### Causa Raiz
**Constraint no banco de dados está errada!**

A tabela `company_subscriptions` tem uma constraint:
```sql
CHECK (billing_type IN ('monthly', 'yearly'))
```

Porém, o código `register-company` tenta inserir:
```typescript
billing_type: 'stripe'  // ❌ Não é permitido pela constraint!
```

**Log do erro:**
```
[register-company] Error saving Stripe customer ID: {
  code: "23514",
  message: 'new row for relation "company_subscriptions" violates check constraint 
           "company_subscriptions_billing_type_check"'
}
```

O cliente Stripe foi criado com sucesso (`cus_Tu0adlMyb2ZcEp`), mas não foi salvo no banco de dados porque o `billing_type: 'stripe'` violou a constraint.

---

## Correções Necessárias

### Correção 1: Atualizar constraint da tabela `company_subscriptions`

Alterar a constraint para aceitar mais valores:
```sql
ALTER TABLE company_subscriptions 
DROP CONSTRAINT company_subscriptions_billing_type_check;

ALTER TABLE company_subscriptions 
ADD CONSTRAINT company_subscriptions_billing_type_check 
CHECK (billing_type IN ('monthly', 'yearly', 'stripe', 'asaas', 'trialing'));
```

### Correção 2: Ajustar código da Edge Function

Alternativamente, podemos usar um valor compatível:
- Usar `billing_type: 'monthly'` como padrão durante o trial
- Ou simplesmente não definir o campo (deixar null/default)

### Correção 3: Tratar email duplicado no registro

Quando o email já existe, vincular ao usuário existente:
```typescript
// Se o usuário já existe, recuperar em vez de criar
const { data: existingUser } = await supabase
  .from('profiles')
  .select('id, law_firm_id')
  .eq('email', admin_email)
  .single();

if (existingUser && existingUser.law_firm_id) {
  // Usuário já tem conta, não criar outra
  return { error: "Email já cadastrado. Use o login ou recuperação de senha." };
}
```

---

## Resumo das Correções

| Problema | Arquivo | Correção |
|----------|---------|----------|
| Constraint `billing_type` inválida | Migração SQL | Adicionar 'stripe', 'trialing' à constraint |
| Email duplicado não tratado | `register-company` | Retornar erro amigável ou vincular ao existente |
| `billing_type: 'stripe'` inválido | `register-company` | Usar 'monthly' ou remover o campo |

---

## Fluxo de Email (Funcionando Corretamente)

O sistema de email está **correto** - o problema é a criação do admin que falhou:

```text
register-company
     │
     ├── Cria law_firm ✅
     ├── Cria company ✅
     ├── Cria admin via create-company-admin
     │         │
     │         ├── Usuário já existe? ❌ FALHA AQUI
     │         ├── Gera senha temporária
     │         ├── Cria usuário no Supabase Auth
     │         └── Envia email via Resend (suporte@miauchat.com.br)
     │
     └── Cria cliente Stripe ✅ (mas não salva por causa da constraint)
```
