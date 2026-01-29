
# Plano: Simplificação do Fluxo de Cadastro

## Objetivo

Simplificar o fluxo de conversão removendo a modal intermediária e redirecionando diretamente para a página de registro, além de adicionar a opção de cobrança anual.

---

## Alterações Necessárias

### 1. Remover Seção "Documentos Legais" da Landing Page

**Arquivo**: `src/pages/landing/LandingPage.tsx`

Remover a seção destacada na imagem (linhas 876-890):
```
{/* Links de Política - Seção destacada para Google OAuth */}
<div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 pb-8 border-b border-white/[0.06]">
  <span className="text-sm text-white/40">Documentos Legais:</span>
  <Link to="/privacidade" ...>🔒 Política de Privacidade</Link>
  <Link to="/termos" ...>📋 Termos de Serviço</Link>
</div>
```

Os links permanecerão disponíveis no rodapé abaixo (duplicados que existem nas linhas 900-913).

---

### 2. Redirecionar Botões para /register ao Invés de Abrir Modal

**Arquivo**: `src/pages/landing/LandingPage.tsx`

Alterar o comportamento de `handlePlanClick` para navegar para `/register` com o plano pré-selecionado:

```typescript
// ANTES
const handlePlanClick = (plan: { name: string; price: string }) => {
  setSelectedPlan(plan);  // Abre modal
};

// DEPOIS
const handlePlanClick = (plan: { name: string }) => {
  // Redireciona para /register com plano na URL
  window.location.href = `/register?plan=${encodeURIComponent(plan.name)}`;
};
```

**Botões afetados**:
- Header "Começar" (linha 248)
- Hero "Quero conhecer o MIAUCHAT" (linha 310)
- Botões dos planos "Começar agora", "Escalar meu atendimento" (linha 746)
- Final CTA "Começar agora" (linha 848)

---

### 3. Remover CheckoutModal da Landing Page

**Arquivo**: `src/pages/landing/LandingPage.tsx`

- Remover import do `CheckoutModal`
- Remover state `selectedPlan`
- Remover componente `<CheckoutModal>` do final

---

### 4. Adicionar Seleção de Período (Mensal/Anual) no Register.tsx

**Arquivo**: `src/pages/Register.tsx`

Adicionar toggle de período de cobrança quando o usuário selecionar "Pagar Agora":

```typescript
// Novo state
const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

// UI - Mostrar apenas quando registrationMode === 'pay_now'
<div className="grid grid-cols-2 gap-3">
  <button onClick={() => setBillingPeriod('monthly')}>
    Mensal: R$ {selectedPlan?.price}
  </button>
  <button onClick={() => setBillingPeriod('yearly')}>
    Anual: R$ {yearlyPrice} (1 mês grátis)
  </button>
</div>
```

---

### 5. Ler Plano da URL e Pré-Selecionar

**Arquivo**: `src/pages/Register.tsx`

Ao carregar a página, verificar se há um plano na URL e pré-selecioná-lo:

```typescript
import { useSearchParams } from "react-router-dom";

const [searchParams] = useSearchParams();

useEffect(() => {
  const planFromUrl = searchParams.get('plan');
  if (planFromUrl && activePlans.length > 0) {
    const matchingPlan = activePlans.find(
      p => p.name.toUpperCase() === planFromUrl.toUpperCase()
    );
    if (matchingPlan) {
      setFormData(prev => ({ ...prev, planId: matchingPlan.id }));
    }
  }
}, [activePlans, searchParams]);
```

---

### 6. Atualizar Chamada ao Checkout para Incluir Período

**Arquivo**: `src/pages/Register.tsx`

Modificar a chamada a `create-asaas-checkout` para enviar `billingPeriod`:

```typescript
// No handleSubmit, quando registrationMode === 'pay_now':
const { data, error } = await supabase.functions.invoke('create-asaas-checkout', {
  body: {
    plan: selectedPlan.name.toLowerCase(),
    billingPeriod,  // 'monthly' ou 'yearly'
    companyName: formData.companyName,
    // ... outros campos
  },
});
```

---

## Resumo das Modificações

| Arquivo | Ação |
|---------|------|
| `src/pages/landing/LandingPage.tsx` | Remover seção "Documentos Legais", trocar modal por redirect, remover CheckoutModal |
| `src/pages/Register.tsx` | Adicionar seleção mensal/anual, ler plano da URL |

---

## Fluxo Final

```
┌─────────────────────────┐
│ Landing Page            │
│ Botão "Começar agora"   │
└───────────┬─────────────┘
            │ redirect para
            │ /register?plan=STARTER
            ▼
┌─────────────────────────────────────────────────┐
│ /register                                       │
│                                                 │
│ ✓ Plano pré-selecionado (STARTER)              │
│ ✓ Formulário de dados da empresa               │
│ ✓ Escolha: Trial Grátis ou Pagar Agora         │
│ ✓ Se "Pagar Agora": escolher Mensal ou Anual   │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ Trial: Cadastro         │     │ Pagar: Checkout ASAAS   │
│ aguardando aprovação    │     │ com período selecionado │
└─────────────────────────┘     └─────────────────────────┘
```

---

## Benefícios

1. **UX Simplificada**: Um único formulário completo ao invés de modal + página
2. **Menos Fricção**: Cliente vai direto ao registro
3. **Flexibilidade**: Opção mensal/anual disponível na página de registro
4. **SEO/Analytics**: URL com plano permite rastrear conversões por plano
5. **Consistência**: Mantém os links legais no rodapé padrão
