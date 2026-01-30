# Plano: Implementar Acesso de Super Admin à Conta do Cliente (Impersonation)

## ✅ Status: IMPLEMENTADO

---

## Contexto da Análise

### Pergunta 1: Como acessar o perfil do cliente?

**Situação Atual:** ✅ Sistema agora possui funcionalidade de impersonation.

**Fluxo implementado:**
1. Super Admin vai em Global Admin > Empresas
2. No menu de ações da empresa, clica "Acessar como Cliente"
3. Uma nova aba abre com a sessão do cliente
4. Banner amarelo indica que está em modo de impersonation
5. Botão "Sair do modo Admin" encerra a sessão

---

### Pergunta 2: Fluxo de Assinatura ASAAS

O sistema possui **3 fluxos de criação de assinatura** que funcionam corretamente:

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

## Implementação Concluída

### Componentes Criados

| Componente | Tipo | Status |
|------------|------|--------|
| `impersonate-user` | Edge Function | ✅ Criado e deployado |
| `ImpersonationBanner` | Componente React | ✅ Criado |
| `useImpersonation` | Hook | ✅ Criado |
| `impersonation_logs` | Tabela | ✅ Criada com RLS |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/impersonate-user/index.ts` | ✅ Criado |
| `src/hooks/useImpersonation.tsx` | ✅ Criado |
| `src/components/layout/ImpersonationBanner.tsx` | ✅ Criado |
| `src/components/layout/AppLayout.tsx` | ✅ Modificado (inclui banner) |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | ✅ Modificado (botão adicionado) |
| `supabase/config.toml` | ✅ Atualizado |

### Segurança

- ✅ Apenas `super_admin` pode usar impersonation
- ✅ Todos os acessos são registrados em `impersonation_logs`
- ✅ Também registrado em `audit_logs` para trilha completa
- ✅ RLS aplicado na tabela de logs
- ✅ Banner visível durante todo o acesso como cliente

---

## Como Usar

1. Acesse o **Global Admin** > **Empresas**
2. Encontre a empresa desejada
3. Clique no menu (⋮) > **"Acessar como Cliente"**
4. Uma nova aba abrirá com a sessão do cliente
5. O banner amarelo mostra que você está em modo de impersonation
6. Clique em **"Sair do modo Admin"** para encerrar

---

## Checklist de Implementação

**Fase 1: Infraestrutura**
- [x] Criar tabela impersonation_logs
- [x] Criar Edge Function impersonate-user
- [x] Deploy da edge function

**Fase 2: Frontend**
- [x] Criar ImpersonationBanner
- [x] Criar useImpersonation hook
- [x] Adicionar botão no GlobalAdminCompanies
- [x] Integrar banner no AppLayout

**Fase 3: Segurança**
- [x] Validar que apenas super_admin pode usar
- [x] Registrar em impersonation_logs
- [x] Registrar em audit_logs
