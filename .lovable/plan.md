

# Plano: Atualização do Formulário de Cadastro

## Resumo das Alterações

Analisei o código atual e identifiquei que:

1. O campo de **subdomínio já existe** no formulário (linhas 329-370)
2. **CPF e Telefone** são opcionais - precisam ser obrigatórios
3. **Falta a opção Trial vs Pagar Agora** - precisa ser implementada

## O Que Será Implementado

### 1. Tornar CPF e Telefone Obrigatórios

**Arquivo**: `src/lib/schemas/companySchema.ts`

Atualizar o `publicRegistrationSchema` para exigir esses campos:

```typescript
phone: z
  .string()
  .min(10, "Telefone é obrigatório")
  .max(20, "Telefone deve ter no máximo 20 caracteres")
  .transform((val) => val?.trim()),

document: z
  .string()
  .min(11, "CPF/CNPJ é obrigatório")
  .max(20, "Documento deve ter no máximo 20 caracteres")
  .transform((val) => val?.trim()),
```

**Arquivo**: `src/pages/Register.tsx`

Adicionar `required` nos inputs de Telefone e CPF, e asterisco (*) nos labels.

### 2. Adicionar Seleção "Pagar Agora" vs "Trial Grátis"

Novo estado para controlar a modalidade:

```typescript
const [registrationMode, setRegistrationMode] = useState<'trial' | 'pay_now'>('trial');
```

Interface visual com dois cards selecionáveis:

```text
┌─────────────────────────────────────────────────────────────┐
│               COMO DESEJA COMEÇAR?                          │
├────────────────────────────┬────────────────────────────────┤
│   💳 PAGAR AGORA           │   🎁 TRIAL GRÁTIS              │
│                            │                                │
│   Acesso imediato após     │   7 dias grátis para          │
│   confirmação do           │   testar todas as             │
│   pagamento                │   funcionalidades             │
└────────────────────────────┴────────────────────────────────┘
```

### 3. Fluxo de Submit Diferenciado

**Se "Pagar Agora" selecionado:**
1. Validar formulário
2. Chamar `create-asaas-checkout` com dados do formulário
3. Redirecionar para checkout ASAAS
4. Após pagamento confirmado → webhook ativa empresa

**Se "Trial Grátis" selecionado:**
1. Validar formulário
2. Verificar se `auto_approve_trial_enabled` está ativo
3. Se SIM: chamar `register-company` com flag `auto_approve_trial: true`
4. Se NÃO: comportamento atual (aguarda aprovação manual)

### 4. Atualizar Edge Function register-company

Adicionar suporte para auto-aprovação de trial:

```typescript
interface RegisterRequest {
  // ... existing fields
  registration_mode?: 'trial' | 'pay_now';
}

// Check auto-approve setting
const { data: settings } = await supabase
  .from('system_settings')
  .select('value')
  .eq('key', 'auto_approve_trial_enabled')
  .single();

const autoApprove = settings?.value === 'true';

if (registration_mode === 'trial' && autoApprove) {
  // Aprovar automaticamente com 7 dias de trial
  // Update company: approval_status = 'approved'
  // Set trial_ends_at = now() + 7 days
  // Call provision-company
}
```

## Arquivos a Serem Modificados

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/schemas/companySchema.ts` | CPF e Telefone obrigatórios |
| `src/pages/Register.tsx` | Adicionar seleção Trial/Pagar + campos required |
| `supabase/functions/register-company/index.ts` | Lógica de auto-aprovação trial |

## Fluxo Visual do Cadastro (Atualizado)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CADASTRE SUA EMPRESA                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nome da Empresa *           [________________________]         │
│                                                                 │
│  Subdomínio                  [________].miauchat.com.br         │
│                              → suaempresa.miauchat.com.br ✓     │
│                                                                 │
│  Nome do Responsável *       [________________________]         │
│                                                                 │
│  Email *                     [________________________]         │
│                                                                 │
│  Telefone *    [______________]   CPF/CNPJ *  [______________] │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Seleção de Plano - Radio com todos os planos ativos]         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  COMO DESEJA COMEÇAR?                                          │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐           │
│  │   💳 PAGAR AGORA     │   │   🎁 TRIAL GRÁTIS   │           │
│  │                      │   │                      │           │
│  │   Acesso imediato    │   │   7 dias grátis     │           │
│  │   após pagamento     │   │   para testar       │           │
│  └──────────────────────┘   └──────────────────────┘           │
│                                                                 │
│            [ Continuar para Pagamento → ]                       │
│            ou                                                   │
│            [ Solicitar Período de Teste → ]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Ordem de Implementação

1. **Atualizar Schema** - Tornar CPF e Telefone obrigatórios
2. **Atualizar Register.tsx** - Adicionar seleção de modo + campos required
3. **Atualizar register-company** - Suporte a auto-aprovação de trial
4. **Testar fluxo completo** - Trial e Pagar Agora

## Comportamento Esperado

### Modo "Pagar Agora"
1. Usuário preenche formulário
2. Clica em "Continuar para Pagamento"
3. Redireciona para checkout ASAAS
4. Após pagamento confirmado:
   - Webhook ASAAS recebe confirmação
   - Empresa é criada e ativada automaticamente
   - Usuário recebe email com dados de acesso

### Modo "Trial Grátis"
1. Usuário preenche formulário
2. Clica em "Solicitar Período de Teste"
3. Se `auto_approve_trial_enabled = true`:
   - Empresa é criada e aprovada automaticamente
   - Trial de 7 dias inicia imediatamente
   - Usuário recebe email com dados de acesso
4. Se `auto_approve_trial_enabled = false`:
   - Empresa é criada como "pendente"
   - Aguarda aprovação manual do admin
   - Usuário vê mensagem de "Cadastro enviado para análise"

