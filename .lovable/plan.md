
# Plano: Correção do Sistema de Cobranças ASAAS

## Diagnóstico Completo

### Problema 1: "Copiado pra onde?"
**Status**: ✅ Funcionando - O toast exibe o link completo quando a cópia automática falha
**Evidência**: Screenshot mostra toast com "Link de pagamento gerado e copiado!" + URL visível

### Problema 2: Faturas não aparecem para o cliente
**Causa Raiz**: A função `list-asaas-invoices` busca `/payments?customer={customer_id}` - mas **pagamentos só existem após o cliente concluir um link de pagamento**. Como ninguém pagou ainda, retorna vazio.

### Problema 3: Faturas não aparecem no ASAAS (em "Cobranças")
**Causa Raiz**: O sistema está criando **Links de Pagamento** (`POST /paymentLinks`), não **Cobranças** (`POST /payments`).

Diferença no ASAAS:
- **Link de Pagamento**: Aparece em "Links de Pagamento" - é um URL que o cliente acessa
- **Cobrança**: Aparece em "Cobranças/Todas" - é uma fatura com vencimento e método definido

### Problema 4: Cliente já criado - reutilização
**Status**: ✅ Funcionando - O código já busca o cliente existente via `asaas_customer_id` ou email antes de criar um novo.

---

## Solução Proposta

### Alterar `admin-create-asaas-subscription` para criar Cobrança Direta

Ao invés de criar um link de pagamento, criar uma **cobrança (payment)** diretamente:

```typescript
// ANTES: Cria link de pagamento
POST /paymentLinks { name, value, chargeType: "RECURRENT", ... }

// DEPOIS: Cria cobrança direta
POST /payments {
  customer: customerId,
  value: priceInReais,
  billingType: "UNDEFINED",  // Cliente escolhe (Boleto/PIX/Cartão)
  dueDate: "YYYY-MM-DD",     // 7 dias a partir de hoje
  description: "Assinatura MiauChat ENTERPRISE + adicionais",
  externalReference: "company:UUID"
}
```

### Criar Assinatura Recorrente
Se você quer cobranças automáticas mensais, é necessário criar uma **Subscription**:

```typescript
POST /subscriptions {
  customer: customerId,
  billingType: "UNDEFINED",
  nextDueDate: "YYYY-MM-DD",
  value: priceInReais,
  cycle: "MONTHLY",
  description: "Assinatura MiauChat ENTERPRISE + adicionais"
}
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Trocar `POST /paymentLinks` por `POST /payments` (ou `/subscriptions` para recorrente) |
| `supabase/functions/generate-payment-link/index.ts` | Mesma lógica para o cliente |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Melhorar feedback - exibir que cobrança foi criada (não link) |

---

## Fluxo Corrigido

```text
┌─────────────────────────┐
│ Admin clica "Gerar      │
│ Fatura/Cobrança" para   │
│ FMO Advogados           │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ admin-create-asaas-subscription:                │
│                                                 │
│ 1. Busca/cria customer no ASAAS                 │
│ 2. Calcula valor: R$ 1.697 + R$ 431,30 = R$ 2.128,30 │
│ 3. POST /subscriptions (ou /payments)          │
│    - billingType: "UNDEFINED" (cliente escolhe) │
│    - nextDueDate: +7 dias                       │
│    - cycle: "MONTHLY"                           │
│    - externalReference: company:UUID            │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ ASAAS cria:                                     │
│ - Subscription recorrente                       │
│ - Primeira cobrança (aparece em "Cobranças")    │
│ - Envia email/SMS ao cliente                    │
│ - Salva asaas_subscription_id no banco         │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ Cliente:                                        │
│ - Vê cobrança em "Ver Faturas" no MiauChat      │
│ - Recebe email/SMS do ASAAS                     │
│ - Pode pagar via Boleto, PIX ou Cartão          │
└─────────────────────────────────────────────────┘
```

---

## Detalhes Técnicos da Nova Edge Function

Trocar o payload de `/paymentLinks` para `/subscriptions`:

```typescript
// Calcular data de vencimento (7 dias a partir de hoje)
const dueDate = new Date();
dueDate.setDate(dueDate.getDate() + 7);
const dueDateStr = dueDate.toISOString().split('T')[0];

// Criar subscription com cobrança recorrente
const subscriptionPayload = {
  customer: customerId,
  billingType: "UNDEFINED",  // Cliente escolhe (Boleto, PIX, Cartão)
  nextDueDate: dueDateStr,
  value: priceInReais,
  cycle: billing_type === "yearly" ? "YEARLY" : "MONTHLY",
  description: description,
  externalReference: `company:${company.id}`.slice(0, 100),
};

const subscriptionResponse = await fetch(`${asaasBaseUrl}/subscriptions`, {
  method: "POST",
  headers: {
    "access_token": asaasApiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(subscriptionPayload),
});
```

### Retorno da API de Subscription

```json
{
  "id": "sub_abc123",
  "customer": "cus_000158741524",
  "value": 2128.30,
  "nextDueDate": "2026-02-05",
  "cycle": "MONTHLY",
  "status": "ACTIVE"
}
```

### Salvar no Banco

```typescript
await supabase
  .from("company_subscriptions")
  .upsert({
    company_id: company.id,
    asaas_customer_id: customerId,
    asaas_subscription_id: subscriptionData.id,  // SALVAR!
    plan_id: company.plan.id,
    billing_type,
    status: "active",
  }, { onConflict: "company_id" });
```

---

## Benefícios

1. **Cobranças visíveis no ASAAS**: Aparecem em "Cobranças → Todas"
2. **Cliente vê faturas**: `list-asaas-invoices` encontrará os payments criados
3. **Recorrência automática**: ASAAS gera cobranças mensais automaticamente
4. **Múltiplos métodos**: Cliente escolhe Boleto, PIX ou Cartão
5. **`asaas_subscription_id` salvo**: Permite atualizar valor via `update-asaas-subscription`
6. **Notificações**: ASAAS envia email/SMS automaticamente

---

## Observações Importantes

1. **billingType "UNDEFINED"**: Permite que o cliente escolha o método de pagamento no momento do pagamento. Se quiser forçar um método específico, use "BOLETO", "PIX" ou "CREDIT_CARD".

2. **Manter `/paymentLinks` para trial/registro**: O fluxo de registro/trial pode continuar usando links de pagamento, pois o cliente ainda não tem vínculo.

3. **Webhook já funciona**: O `asaas-webhook` já salva o `asaas_subscription_id` quando recebe PAYMENT_CONFIRMED, então os dados ficarão sincronizados.
