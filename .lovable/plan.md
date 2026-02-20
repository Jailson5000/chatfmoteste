
## Melhorias: Próxima Fatura em Empresas + Aba Pagamentos

### Diagnóstico dos Dois Problemas

---

### Problema 1 — "Próxima fatura" nula na tela de Empresas

**Causa raiz confirmada pelo banco de dados:**
`current_period_end` está `NULL` em 100% das assinaturas existentes. O webhook do Stripe (`invoice.paid`) já tem o código correto para preencher esse campo, mas:
- Assinaturas antigas foram criadas antes dessa lógica existir
- A função `admin-create-stripe-subscription` (usada para gerar links) não salva `current_period_end` após criar a assinatura

**Solução:** Criar uma nova edge function `sync-stripe-subscriptions` que busca cada assinatura ativa do Stripe pela API e atualiza `current_period_end` no banco. Adicionar um botão "Sincronizar Stripe" na tela de Empresas para disparar isso manualmente.

---

### Problema 2 — Aba Pagamentos incompleta

O que falta comparado ao que seria útil:

| O que falta | Causa |
|---|---|
| Lista de todas assinaturas ativas com próximo vencimento | Não existe essa aba/view |
| Agrupamento por plano incorreto (mostra "Outro" para todos) | Lógica usa substring no `productId` que não funciona com IDs reais do Stripe (`prod_xxx`) |
| Valor do MRR não bate com realidade | `subscriptionsByPlan` está tudo como "Outro" |
| Não tem aba "Todas as Assinaturas" para visão consolidada | Não implementado |

**Solução:** 
1. Corrigir o `get-payment-metrics` para buscar o nome do produto diretamente da API do Stripe (em vez de tentar inferir pelo ID)
2. Adicionar uma nova aba "Assinaturas" em `GlobalAdminPayments.tsx` que mostra uma tabela com todas as assinaturas ativas, usando os dados já disponíveis na tabela `company_subscriptions` do banco (sem nova edge function)

---

### Implementação Detalhada

#### 1. Nova Edge Function: `sync-stripe-subscriptions`

Cria `supabase/functions/sync-stripe-subscriptions/index.ts`:
- Requer autenticação de admin global
- Itera por todas as assinaturas em `company_subscriptions` que têm `stripe_subscription_id`
- Para cada uma, chama `stripe.subscriptions.retrieve(id)` no Stripe
- Atualiza `current_period_end`, `current_period_start`, `next_payment_at` e `status` no banco
- Retorna resumo: quantas foram sincronizadas, quantas falharam

#### 2. Botão "Sincronizar" na tela de Empresas

Em `GlobalAdminCompanies.tsx`:
- Adicionar botão "Sincronizar Stripe" no cabeçalho da aba "Aprovadas" (ao lado dos botões de exportar)
- Chama a nova edge function e invalida o cache `["companies"]`
- Mostra toast com resultado da sincronização

#### 3. Corrigir agrupamento por plano no `get-payment-metrics`

Em `supabase/functions/get-payment-metrics/index.ts`:
- Substituir a lógica de substring `productId.includes("starter")` pela busca real do nome do produto via `stripe.products.retrieve(productId)` (ou buscar em batch)
- Mapear pelo nome do produto do Stripe em vez de tentar inferir pelo ID

#### 4. Nova aba "Assinaturas" em Pagamentos

Em `GlobalAdminPayments.tsx`:
- Adicionar 4ª aba "Assinaturas" no `TabsList`
- Fazer query direta ao banco (`company_subscriptions` + `companies` + `plans`) — sem nova edge function
- Mostrar tabela com colunas: Empresa, Plano, Status, Último Pagamento, Próximo Vencimento, Ação (Ver Detalhe)
- Filtros por status (Ativo, Vencido, Trial, Cancelado)
- Ordenar por próximo vencimento (mais próximo primeiro)

---

### Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/sync-stripe-subscriptions/index.ts` | NOVO — sincroniza dados do Stripe para o banco |
| `supabase/functions/get-payment-metrics/index.ts` | Corrigir agrupamento de planos |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar botão "Sincronizar Stripe" |
| `src/pages/global-admin/GlobalAdminPayments.tsx` | Adicionar aba "Assinaturas" |

---

### Fluxo da Sincronização

Tela Empresas → Botão "Sincronizar Stripe" → edge function → Stripe API (busca cada sub) → Atualiza banco → Tela exibe "Venc: 20/03/2026"

Após a sincronização, os webhooks futuros do Stripe continuam mantendo os dados atualizados automaticamente via `invoice.paid`.

---

### Risco e Impacto

| Item | Risco |
|---|---|
| Nova edge function de sincronização | Baixo — só leitura do Stripe + update no banco |
| Botão de sincronização | Muito baixo — ação manual sob demanda |
| Corrigir agrupamento de planos | Baixo — adiciona chamadas de API mas melhora precisão |
| Nova aba "Assinaturas" | Baixo — query ao banco, dados já existem |

Nenhuma alteração em tabelas ou RLS. A coluna `current_period_end` já existe no banco (confirmado), só precisa ser preenchida.
