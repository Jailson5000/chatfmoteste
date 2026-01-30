
# Plano: Correção do Fluxo de Auto-Aprovação de Trial

## Problema Identificado

A empresa **PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA** (elaine.matos@pndistribuidora.com.br) se cadastrou via trial com auto-aprovação, mas **o usuário admin não foi criado** e **o email de acesso não foi enviado**.

### Logs de Erro
```
[register-company] Provision result: { error: "Unauthorized" }
[provision-company] Auth error: AuthApiError: invalid claim: missing sub claim
```

### Causa Raiz

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ FLUXO ATUAL (quebrado)                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  register-company (PÚBLICO, sem auth)                                       │
│        │                                                                    │
│        ▼                                                                    │
│  Cria law_firm + company ✅                                                  │
│        │                                                                    │
│        ▼                                                                    │
│  Chama provision-company com SERVICE ROLE KEY                               │
│        │                                                                    │
│        ▼                                                                    │
│  provision-company chama getUser(serviceRoleKey) ❌                         │
│        │                                                                    │
│        └──── ERRO: "missing sub claim" (service key não é JWT de usuário)  │
│                                                                             │
│  Resultado: Empresa criada, mas sem usuário admin                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

A função `provision-company` foi desenhada para ser chamada por **admins autenticados** (via dashboard). Ela valida a autenticação com `supabase.auth.getUser()`, que espera um JWT de usuário.

Quando `register-company` chama `provision-company` passando a **service role key** como Bearer token, a validação falha porque a service role key não tem o claim `sub` (user ID).

## Solução

### Parte 1: Correção Imediata para Elaine

Chamar a função `create-company-admin` diretamente para criar o usuário e enviar o email. Esta função **não exige autenticação** de admin.

**Dados para criar:**
| Campo | Valor |
|-------|-------|
| company_id | e2fc7ac0-8b14-4ba5-968b-7d9d87bb57ef |
| company_name | PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA |
| law_firm_id | 25fd258f-a161-4426-8181-4ad05079415c |
| subdomain | pndistribuidora |
| admin_email | elaine.matos@pndistribuidora.com.br |
| admin_name | PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA |

### Parte 2: Correção Estrutural no Código

Modificar `register-company` para chamar `create-company-admin` **diretamente** em vez de `provision-company`.

**Por quê funciona:**
- `create-company-admin` foi desenhada para ser chamada por outras Edge Functions
- Não valida autenticação de usuário
- Usa service role key internamente

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/register-company/index.ts` | Substituir chamada a `provision-company` por `create-company-admin` |

## Implementação Detalhada

### Antes (linhas 339-366 de register-company)
```typescript
// If auto-approved, call provision-company to create admin user
if (shouldAutoApprove) {
  console.log(`[register-company] Auto-approving trial, calling provision-company...`);
  
  try {
    const provisionResponse = await fetch(`${supabaseUrl}/functions/v1/provision-company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        company_id: company.id,
        admin_name,
        admin_email,
      }),
    });
    // ... error handling
  } catch (provisionError) {
    // ...
  }
}
```

### Depois
```typescript
// If auto-approved, create admin user directly
if (shouldAutoApprove) {
  console.log(`[register-company] Auto-approving trial, creating admin user...`);
  
  try {
    // Call create-company-admin directly (it doesn't require user auth)
    const adminResponse = await fetch(`${supabaseUrl}/functions/v1/create-company-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        company_id: company.id,
        company_name,
        law_firm_id: lawFirm.id,
        subdomain,
        admin_name,
        admin_email,
      }),
    });

    const adminResult = await adminResponse.json();
    console.log(`[register-company] Admin creation result:`, adminResult);

    if (!adminResponse.ok || !adminResult.success) {
      console.error(`[register-company] Admin creation failed:`, adminResult);
      // Update company status to show partial provisioning
      await supabase.from('companies').update({
        client_app_status: 'error',
        initial_access_email_error: adminResult.error || 'Failed to create admin user',
      }).eq('id', company.id);
    } else {
      // Update company with successful provisioning
      await supabase.from('companies').update({
        admin_user_id: adminResult.user_id,
        client_app_status: 'created',
        provisioning_status: 'partial', // Partial because n8n isn't created yet
        initial_access_email_sent: true,
        initial_access_email_sent_at: new Date().toISOString(),
      }).eq('id', company.id);
    }
  } catch (adminError) {
    console.error(`[register-company] Error creating admin:`, adminError);
  }
  
  // Optionally, also create n8n workflow
  try {
    console.log(`[register-company] Creating n8n workflow...`);
    await fetch(`${supabaseUrl}/functions/v1/create-n8n-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        company_id: company.id,
        company_name,
        law_firm_id: lawFirm.id,
        subdomain,
        auto_activate: true,
      }),
    });
  } catch (n8nError) {
    console.log(`[register-company] N8N workflow creation skipped/failed (non-critical)`);
  }
}
```

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ FLUXO CORRIGIDO                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  register-company (PÚBLICO, sem auth)                                       │
│        │                                                                    │
│        ▼                                                                    │
│  Cria law_firm + company ✅                                                  │
│        │                                                                    │
│        ▼                                                                    │
│  Chama create-company-admin (não exige auth de usuário) ✅                  │
│        │                                                                    │
│        ├──── Cria usuário auth ✅                                           │
│        ├──── Cria profile ✅                                                │
│        ├──── Envia email com credenciais ✅                                 │
│        └──── Atualiza company.admin_user_id ✅                              │
│        │                                                                    │
│        ▼                                                                    │
│  Chama create-n8n-workflow (opcional, non-blocking)                        │
│                                                                             │
│  Resultado: Empresa + Usuário + Email = Fluxo Completo                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Benefícios

1. **Fluxo simplificado**: Chama diretamente as funções específicas
2. **Sem dependência de auth**: `create-company-admin` não valida JWT
3. **Rastreabilidade melhor**: Logs mais claros do que foi criado
4. **Granularidade**: Falha no n8n não bloqueia criação do usuário

## Checklist de Validação

- [ ] Criar usuário para Elaine (correção imediata)
- [ ] Email enviado para Elaine com credenciais
- [ ] Testar novo cadastro trial com auto-approve
- [ ] Verificar que usuário é criado corretamente
- [ ] Verificar que email é enviado
- [ ] Verificar que company.admin_user_id é preenchido
- [ ] Verificar que status de provisioning é atualizado

## Observação sobre Segurança

A mudança não introduz riscos de segurança porque:
- `create-company-admin` já usa service role key internamente
- A função só pode ser chamada de dentro das Edge Functions (não exposta publicamente com dados sensíveis)
- O fluxo continua sendo: cadastro público → validação → criação controlada
