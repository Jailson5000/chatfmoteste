
# Plano: Correção da Integração Stripe - Faturas e Webhook

## 📋 Resumo dos Problemas Encontrados

### Problema 1: Faturas não aparecem para o cliente
**Causa raiz**: A função `list-stripe-invoices` não encontra o `stripe_customer_id` porque a query aninhada `company_subscriptions(stripe_customer_id)` não funciona corretamente devido à forma como o relacionamento está configurado.

**Evidência**: 
- Log: `"No Stripe customer ID found" - {"companyId":"08370f53-1f7c-4e72-91bc-425c8da3613b"}`
- Mas no banco: `stripe_customer_id: cus_TtzlYvo7KEtYwo` EXISTE na tabela `company_subscriptions`

### Problema 2: Webhook não está recebendo eventos
**Causa raiz**: O Stripe Dashboard mostra "Total 0" entregas de eventos, o que significa que o Stripe nunca enviou eventos para o webhook.

**Possíveis causas**:
1. O `STRIPE_WEBHOOK_SECRET` configurado aqui não corresponde ao secret do endpoint no Stripe Dashboard
2. O webhook foi criado recentemente e os eventos anteriores não foram capturados
3. Os eventos configurados não incluem `invoice.created` (apenas assinaturas)

---

## 🔧 Correções Necessárias

### Correção 1: Atualizar `list-stripe-invoices` (Edge Function)

**Arquivo**: `supabase/functions/list-stripe-invoices/index.ts`

**Mudança**: Substituir a query aninhada por uma consulta direta à tabela `company_subscriptions`:

```typescript
// ANTES (não funciona):
const { data: company } = await supabase
  .from("companies")
  .select("id, name, company_subscriptions(stripe_customer_id)")
  .eq("law_firm_id", profile.law_firm_id)
  .single();

const stripeCustomerId = company.company_subscriptions?.[0]?.stripe_customer_id;

// DEPOIS (corrigido):
// 1. Buscar empresa
const { data: company } = await supabase
  .from("companies")
  .select("id, name")
  .eq("law_firm_id", profile.law_firm_id)
  .single();

// 2. Buscar subscription separadamente
const { data: subscription } = await supabase
  .from("company_subscriptions")
  .select("stripe_customer_id")
  .eq("company_id", company.id)
  .maybeSingle();

const stripeCustomerId = subscription?.stripe_customer_id;
```

### Correção 2: Verificar/Atualizar o STRIPE_WEBHOOK_SECRET

**Ação manual necessária**: O usuário precisa verificar se o secret configurado no projeto corresponde ao secret exibido no Stripe Dashboard.

No Stripe Dashboard:
1. Acesse `Webhooks > miauchatstripe > Detalhes do destino`
2. Clique em "Exibir" ao lado de "Segredo da assinatura" (`whsec_...`)
3. Compare com o secret atual configurado no projeto

**Para atualizar**: Use a ferramenta de secrets para inserir o valor correto do `STRIPE_WEBHOOK_SECRET`.

### Correção 3: Adicionar mais logging ao webhook

**Arquivo**: `supabase/functions/stripe-webhook/index.ts`

Adicionar mais logs para diagnóstico:

```typescript
// No início da função, antes da verificação de assinatura:
logStep("Request received", { 
  hasSignature: !!signature,
  signatureStart: signature?.substring(0, 20) + "...",
  bodyLength: body.length 
});
```

---

## 📝 Verificação do Webhook Secret

Para verificar se o secret está correto, você precisará:

1. **No Stripe Dashboard**: 
   - Ir para "Workbench > Webhooks > miauchatstripe"
   - Clicar no ícone de olho (👁️) ao lado de "Segredo da assinatura"
   - Copiar o valor `whsec_xxxxx...`

2. **No Lovable**:
   - Atualizar o secret `STRIPE_WEBHOOK_SECRET` com o valor copiado

---

## 🧪 Plano de Testes

### Após as correções:

1. **Testar listagem de faturas**:
   - Acessar `/settings` como usuário da FMO Advogados
   - Clicar em "Ver Faturas"
   - Verificar se as 2 faturas em aberto aparecem

2. **Testar webhook**:
   - Criar nova cobrança Stripe para uma empresa
   - Verificar logs do `stripe-webhook` para ver se eventos chegaram
   - Verificar se o erro de signature verification aparece (indicará secret incorreto)

3. **Testar fluxo completo de pagamento**:
   - Usar cartão de teste (4242...)
   - Verificar se `invoice.paid` é recebido pelo webhook
   - Verificar se status muda para "active" nas tabelas

---

## 📁 Arquivos a Modificar

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `supabase/functions/list-stripe-invoices/index.ts` | Corrigir query para buscar subscription |
| `supabase/functions/stripe-webhook/index.ts` | Adicionar mais logging |
| `STRIPE_WEBHOOK_SECRET` | Verificar/Atualizar secret (ação manual) |

---

## ⚠️ Ação Manual Crítica

**O usuário PRECISA verificar o STRIPE_WEBHOOK_SECRET**:

Pela imagem, vejo que o webhook está configurado no Stripe mas mostra "0 entregas". Isso pode significar que:
- O secret está incorreto (mais provável)
- Os eventos não foram disparados ainda

Se o secret estiver errado, o webhook retornará erro 400 "Webhook signature verification failed" e isso não será logado porque o Stripe não consegue validar a assinatura.
