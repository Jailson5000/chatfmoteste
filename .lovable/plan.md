

# Correção: Navegação Inteligente por Status de Aprovação

## Problema Identificado

Quando você clica em "Ajustar Limites" ou "Alterar Plano" no painel lateral do Dashboard (Empresas Ativas), o sistema redireciona para `/global-admin/companies?edit=XXX`.

**Comportamento atual:**
- Sempre abre na aba "Pendentes" (porque `activeTab` começa como `"pending"`)
- Não lê o parâmetro `?edit=...` da URL
- Não determina qual aba corresponde à empresa

**Comportamento esperado:**
- Se a empresa está aprovada → abrir na aba "Aprovadas"
- Se a empresa está pendente → abrir na aba "Pendentes"
- Se a empresa está rejeitada → abrir na aba "Rejeitadas"

---

## Solução

### Arquivo: `src/pages/global-admin/GlobalAdminCompanies.tsx`

**1. Adicionar import do `useSearchParams`:**
```typescript
import { useSearchParams } from "react-router-dom";
```

**2. Ler parâmetro da URL e determinar tab correta:**
```typescript
const [searchParams] = useSearchParams();
const editCompanyId = searchParams.get("edit");

// Effect para detectar empresa do edit param e abrir na aba correta
useEffect(() => {
  if (editCompanyId && companies.length > 0) {
    // Encontrar a empresa pelo ID
    const company = companies.find(c => c.id === editCompanyId);
    
    if (company) {
      // Determinar qual aba abrir baseado no approval_status
      const targetTab = 
        company.approval_status === 'pending_approval' ? 'pending' :
        company.approval_status === 'rejected' ? 'rejected' : 
        'approved';
      
      setActiveTab(targetTab);
      
      // Também abrir o dialog de edição
      openEditDialog(company);
    }
  }
}, [editCompanyId, companies]);
```

**3. Mudar valor inicial de `activeTab`:**
```typescript
// Antes:
const [activeTab, setActiveTab] = useState("pending");

// Depois:
const [activeTab, setActiveTab] = useState<string>("approved");
// Ou usar lógica para default baseado no edit param
```

---

## Fluxo Corrigido

```text
Dashboard → Clique "Ajustar Limites" (Liz importados - Aprovada)
     │
     ▼
Navega para: /global-admin/companies?edit=xxx
     │
     ▼
GlobalAdminCompanies carrega
     │
     ▼
Lê searchParams.get("edit") → "xxx"
     │
     ▼
Busca empresa em companies pelo ID
     │
     ▼
Verifica approval_status da empresa
     │
     ├── "pending_approval" → setActiveTab("pending")
     ├── "rejected" → setActiveTab("rejected")
     └── "approved" ou null → setActiveTab("approved")
     │
     ▼
Abre Dialog de edição automaticamente
```

---

## Mudanças Resumidas

| Arquivo | Mudança |
|---------|---------|
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar `useSearchParams`, useEffect para detectar edit param e abrir tab + dialog corretos |

---

## Testes Recomendados

1. No Dashboard, clicar em "Ajustar Limites" de empresa **aprovada** → Deve abrir aba "Aprovadas"
2. Se houver empresa pendente, clicar → Deve abrir aba "Pendentes"
3. Acessar `/global-admin/companies` diretamente (sem param) → Comportamento normal
4. Verificar se dialog de edição abre automaticamente

