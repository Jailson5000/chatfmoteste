
# Plano: Adicionar Opção Trial no Checkout da Landing Page + Criar Faturas ASAAS para Empresas Existentes

## Problema Identificado

### 1. Falta da Opção Trial no CheckoutModal

O fluxo atual:
- **Landing Page** → clica "Começar agora" → abre `CheckoutModal` → **SÓ PAGAMENTO** (sem opção Trial)
- **Página `/register`** → tem opção Trial/Pagar (mas só é acessada se `manual_registration_enabled = true`)

O `CheckoutModal` não tem a seleção "Trial Grátis" vs "Pagar Agora" que foi implementada no `Register.tsx`.

### 2. Criar Faturas no ASAAS para Empresas Existentes

Para empresas já cadastradas no sistema, podemos criar assinaturas no ASAAS de duas formas:
- **Via Painel Admin**: Criar uma Edge Function que gera cobranças para empresas específicas
- **Via empresa**: A empresa pode acessar "Meu Plano" e clicar em "Assinar Agora"

---

## Solução Parte 1: Adicionar Opção Trial no CheckoutModal

### Arquivo: `src/components/landing/CheckoutModal.tsx`

**Mudanças necessárias:**

1. Adicionar estado para modo de registro:
```typescript
const [registrationMode, setRegistrationMode] = useState<'trial' | 'pay_now'>('pay_now');
```

2. Adicionar seleção visual (antes do formulário de billing):
```typescript
{/* Registration Mode Selection */}
<div className="space-y-3">
  <Label className="text-white/70 font-medium">Como deseja começar?</Label>
  
  <div className="grid grid-cols-2 gap-3">
    {/* Pagar Agora */}
    <button onClick={() => setRegistrationMode('pay_now')} ...>
      💳 Pagar Agora
      Acesso imediato após pagamento
    </button>
    
    {/* Trial Grátis */}
    <button onClick={() => setRegistrationMode('trial')} ...>
      🎁 Trial Grátis
      7 dias para testar
    </button>
  </div>
</div>
```

3. Alterar o `handleSubmit`:
```typescript
if (registrationMode === 'trial') {
  // Redirecionar para /register com dados do plano
  navigate(`/register?plan=${plan.name.toLowerCase()}`);
  // OU chamar register-company diretamente
} else {
  // Checkout ASAAS (fluxo atual)
}
```

4. Esconder seleção de período de cobrança quando Trial selecionado

5. Atualizar botão de submit dinamicamente:
- Trial: "Iniciar Período de Teste" (verde)
- Pagar: "Continuar para Pagamento" (vermelho)

---

## Solução Parte 2: Criar Faturas ASAAS para Empresas Existentes

### Opção A: Via Painel Admin Global (Recomendado)

Criar uma nova Edge Function `admin-create-asaas-subscription` que:
- Recebe `company_id` do admin
- Busca dados da empresa e plano
- Cria cliente no ASAAS (se não existir)
- Cria assinatura/cobrança para a empresa
- Atualiza `company_subscriptions`

**Interface no Admin Global:**
Na tabela de empresas, adicionar botão "Gerar Cobrança ASAAS" que:
1. Abre modal com opções (mensal/anual)
2. Chama a Edge Function
3. Exibe link gerado ou confirma criação

### Opção B: Via Própria Empresa

A empresa já pode fazer isso através de:
- **Configurações > Meu Plano > Assinar Agora** (que usa `generate-payment-link`)
- **Página Trial Expirado** (para empresas com trial expirado)

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/landing/CheckoutModal.tsx` | Adicionar seleção Trial/Pagar + novo fluxo de submit |
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Nova Edge Function para admin criar cobranças |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Botão "Gerar Cobrança" na tabela |

---

## Fluxo Atualizado da Landing Page

```
┌─────────────────────────────────────────────────────────────┐
│  Usuário clica "Começar Agora" em qualquer plano            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CHECKOUT MODAL                                              │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ 💳 Pagar Agora  │  │ 🎁 Trial Grátis │                   │
│  │                 │  │                  │                   │
│  │ Acesso imediato │  │ 7 dias grátis   │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
│  [Se Pagar] → Período: Mensal/Anual                         │
│  [Formulário: Nome, Email, Telefone*, CPF*]                  │
│                                                              │
│  [Botão dinâmico baseado na escolha]                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│  PAGAR AGORA    │             │  TRIAL GRÁTIS   │
│                 │             │                 │
│  → create-asaas │             │  → register-    │
│    -checkout    │             │    company      │
│  → Redireciona  │             │  → Auto-aprovar │
│    para ASAAS   │             │    se habilitado│
└─────────────────┘             └─────────────────┘
```

---

## Detalhes Técnicos do CheckoutModal Atualizado

### Estado Adicional
```typescript
const [registrationMode, setRegistrationMode] = useState<'trial' | 'pay_now'>('pay_now');
```

### Novo handleSubmit
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Validação (já existente)
  if (!formData.companyName || !formData.adminName || !formData.adminEmail) {...}
  if (!formData.adminPhone || !formData.document) {
    toast.error("Telefone e CPF/CNPJ são obrigatórios");
    return;
  }

  if (registrationMode === 'trial') {
    // FLUXO TRIAL: chamar register-company
    const { data, error } = await supabase.functions.invoke('register-company', {
      body: {
        company_name: formData.companyName,
        admin_name: formData.adminName,
        admin_email: formData.adminEmail,
        phone: formData.adminPhone,
        document: formData.document,
        plan_name: plan.name.toLowerCase(),
        registration_mode: 'trial',
      },
    });

    if (data?.auto_approved) {
      toast.success("Trial ativado! Verifique seu email.");
    } else {
      toast.success("Cadastro enviado para análise!");
    }
    onOpenChange(false);
    return;
  }

  // FLUXO PAGAR (código atual)
  const functionName = paymentProvider === "asaas" ? "create-asaas-checkout" : "create-checkout-session";
  // ... resto do código atual
};
```

---

## Criar Faturas para Empresas Existentes - Edge Function

### Nova Edge Function: `admin-create-asaas-subscription`

```typescript
// Recebe: company_id, billing_type (monthly/yearly)
// Valida: usuário é admin global
// Busca: empresa, plano
// Cria: cliente ASAAS (se não existir)
// Cria: assinatura recorrente ou link de pagamento
// Atualiza: company_subscriptions
// Retorna: URL de pagamento ou confirmação
```

Isso permitirá que o admin global gere cobranças para qualquer empresa do sistema diretamente do painel administrativo.

---

## Ordem de Implementação

1. **Atualizar CheckoutModal** - Adicionar seleção Trial/Pagar
2. **Atualizar register-company** - Aceitar plan_name além de plan_id
3. **Criar admin-create-asaas-subscription** - Para admin gerar cobranças
4. **Atualizar GlobalAdminCompanies** - Adicionar botão na tabela
5. **Testar fluxos** - Landing → Trial, Landing → Pagar, Admin → Gerar cobrança
