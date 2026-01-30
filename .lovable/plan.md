

# Plano: Implementar Acesso de Super Admin à Conta do Cliente (Impersonation)

## Contexto da Análise

### Pergunta 1: Como acessar o perfil do cliente?

**Situação Atual:** O sistema **NÃO possui** funcionalidade de impersonation (login como cliente).

**Opções atuais para ajudar cliente:**
1. Resetar senha do admin no Global Admin
2. Logar com as credenciais temporárias
3. Configurar a plataforma
4. Pedir ao cliente que altere a senha

**Recomendação:** Implementar funcionalidade de "Acessar como Cliente" no Global Admin.

---

### Pergunta 2: Fluxo de Assinatura ASAAS

O sistema já possui **3 fluxos de criação de assinatura** que funcionam corretamente:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUXOS DE ASSINATURA ASAAS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FLUXO A: Landing Page ("Pagar Agora")                                     │
│  ─────────────────────────────────────                                     │
│  Visitante → Clica "Assinar" → create-asaas-checkout                       │
│                                      ↓                                      │
│                              Cria Assinatura ASAAS imediatamente           │
│                                      ↓                                      │
│                              Redireciona para pagamento                    │
│                                                                             │
│  FLUXO B: Cliente em Trial (Meu Plano)                                     │
│  ─────────────────────────────────────                                     │
│  Cliente logado → Vê banner Trial → Clica "Assinar Agora"                  │
│                                           ↓                                 │
│                                   generate-payment-link                     │
│                                           ↓                                 │
│                                   Cria Payment Link ASAAS                  │
│                                           ↓                                 │
│                                   Redireciona para pagamento               │
│                                                                             │
│  FLUXO C: Admin Global (Dashboard)                                         │
│  ─────────────────────────────────                                         │
│  Super Admin → Clica "Gerar Cobrança" → admin-create-asaas-subscription    │
│                                               ↓                             │
│                                       Cria Subscription ASAAS              │
│                                               ↓                             │
│                                       ASAAS envia email/SMS ao cliente     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Resposta:** A criação no ASAAS **SÓ acontece** quando:
- O cliente clica em "Assinar Agora" (Fluxo A ou B)
- OU o Admin Global clica em "Gerar Cobrança" (Fluxo C)

**Não há criação automática** - a assinatura só existe se alguém executar uma dessas ações.

---

## Solução Proposta: Implementar "Acessar como Cliente"

Esta funcionalidade permite que um Super Admin acesse a plataforma como se fosse o admin da empresa, sem precisar da senha do cliente.

### Arquitetura de Segurança

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE IMPERSONATION SEGURO                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Super Admin clica "Acessar como Cliente"                               │
│           │                                                                 │
│           ▼                                                                 │
│  2. Frontend chama Edge Function `impersonate-user`                        │
│           │                                                                 │
│           ▼                                                                 │
│  3. Edge Function valida:                                                   │
│     - Usuário é super_admin?                                               │
│     - Target user existe?                                                  │
│     - Cria sessão temporária com flag `impersonating: true`                │
│           │                                                                 │
│           ▼                                                                 │
│  4. Registra em audit_logs (quem, quando, qual empresa)                    │
│           │                                                                 │
│           ▼                                                                 │
│  5. Retorna URL com token temporário                                       │
│           │                                                                 │
│           ▼                                                                 │
│  6. Frontend abre nova aba com sessão do cliente                           │
│           │                                                                 │
│           ▼                                                                 │
│  7. Banner permanente: "Você está acessando como [Empresa]"                │
│     Botão: "Sair do modo Admin"                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes a Criar

| Componente | Tipo | Descrição |
|------------|------|-----------|
| `impersonate-user` | Edge Function | Gera sessão temporária para o target user |
| `ImpersonationBanner` | Componente React | Banner indicando modo impersonation |
| `useImpersonation` | Hook | Gerencia estado de impersonation |
| Coluna `impersonation_logs` | Tabela | Registra todos os acessos de impersonation |

### Modificações no Global Admin

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

Adicionar botão no menu de ações de cada empresa:

```typescript
<DropdownMenuItem onClick={() => handleImpersonate(company)}>
  <ExternalLink className="mr-2 h-4 w-4" />
  Acessar como Cliente
</DropdownMenuItem>
```

### Edge Function: impersonate-user

```typescript
// Validações de segurança:
// 1. Verificar se caller é super_admin
// 2. Verificar se target_user existe
// 3. Criar custom token com claims extras
// 4. Registrar em audit_logs
// 5. Retornar URL com token
```

### Indicador Visual (Banner)

Quando acessando como cliente, mostrar banner fixo:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔐 Você está acessando como: PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA   │
│                                                         [Sair do modo Admin]│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/impersonate-user/index.ts` | Criar | Edge Function de impersonation |
| `src/hooks/useImpersonation.tsx` | Criar | Hook para gerenciar estado |
| `src/components/layout/ImpersonationBanner.tsx` | Criar | Banner indicador |
| `src/components/layout/AppLayout.tsx` | Modificar | Incluir ImpersonationBanner |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Modificar | Adicionar botão de acesso |

### Migração SQL

```sql
CREATE TABLE public.impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_company_id uuid REFERENCES public.companies(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ip_address text,
  user_agent text
);

-- RLS: Apenas super_admins podem ver
ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view impersonation logs"
ON public.impersonation_logs FOR SELECT
TO authenticated
USING (public.has_admin_role(auth.uid(), 'super_admin'));
```

---

## Análise de Risco

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Uso indevido de impersonation | Baixa | Alto | Apenas super_admin + audit log |
| Exposição de dados sensíveis | Baixa | Alto | Banner visível + logs |
| Sessão esquecida aberta | Média | Médio | Timeout automático de 1 hora |
| Conflito de sessões | Baixa | Baixo | Usar aba separada |

---

## Alternativa Mais Simples (Sem Impersonation)

Se preferir não implementar impersonation, podemos criar:

**"Assistente de Configuração Remota"** - Uma página dentro do Global Admin que permite:
- Ver e editar configurações do cliente diretamente pelo admin
- Sem precisar logar na conta
- Exemplos: Configurar agente IA, adicionar templates, configurar automações

Isso seria menos invasivo mas requereria duplicar muitos componentes.

---

## Recomendação

Implementar o **Impersonation Seguro** é a solução mais completa porque:
1. Permite ajudar o cliente em qualquer situação
2. Usa a mesma interface que o cliente vê (sem duplicação)
3. Auditoria completa de quem acessou o quê
4. Banner deixa claro que é acesso administrativo

---

## Checklist de Implementação

**Fase 1: Infraestrutura**
- [ ] Criar tabela impersonation_logs
- [ ] Criar Edge Function impersonate-user
- [ ] Testar geração de sessão temporária

**Fase 2: Frontend**
- [ ] Criar ImpersonationBanner
- [ ] Criar useImpersonation hook
- [ ] Adicionar botão no GlobalAdminCompanies
- [ ] Integrar banner no AppLayout

**Fase 3: Segurança**
- [ ] Validar que apenas super_admin pode usar
- [ ] Implementar timeout de sessão
- [ ] Testar audit logs

**Fase 4: UX**
- [ ] Botão "Sair do modo Admin" funcional
- [ ] Notificação ao entrar/sair do modo

