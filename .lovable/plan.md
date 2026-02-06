

# Plano: Exportação Excel de Clientes e Material Comercial

## Resumo

Adicionar/melhorar exportação em Excel para:
1. **Lista de Clientes** - Expandir dados exportados para incluir informações completas
2. **Material Comercial** - Adicionar botão de exportação Excel ao lado do PDF existente

---

## 1. Exportação de Clientes (Melhorias)

### Situação Atual
A página de Contatos (`src/pages/Contacts.tsx`) já possui exportação Excel com os campos:
- Nome, Telefone, Email, CPF/CNPJ, Status, Departamento, Endereço, Observações, Data de Criação

### Melhoria Proposta
Adicionar campos que estão disponíveis no sistema mas não estão sendo exportados:

| Campo Atual | Campos a Adicionar |
|-------------|-------------------|
| Nome | **Responsável** |
| Telefone | **Última Atualização** |
| Email | **Consentimento LGPD** |
| CPF/CNPJ | **Data Consentimento LGPD** |
| Status | **Conexão WhatsApp** |
| Departamento | |
| Endereço | |
| Observações | |
| Criado Em | |

### Alteração no Arquivo: `src/pages/Contacts.tsx`

Modificar a função `handleExport` (linhas 214-232):

```typescript
const handleExport = () => {
  const dataToExport = filteredClients.map((client) => {
    const status = getStatusById(client.custom_status_id);
    const department = getDepartmentById(client.department_id);
    
    // Get connection display
    const conversation = client.conversations?.[0];
    const inst = client.whatsapp_instance || conversation?.whatsapp_instance;
    const conexao = conversation?.origin === 'WIDGET' || conversation?.origin === 'WEB' 
      ? 'Chat Web' 
      : (inst?.display_name || inst?.instance_name || '');
    
    return {
      Nome: client.name,
      Telefone: formatPhone(client.phone),
      Email: client.email || "",
      CPF_CNPJ: client.document || "",
      Status: status?.name || "",
      Departamento: department?.name || "",
      Responsavel: client.assigned_profile?.full_name || "",
      Conexao_WhatsApp: conexao,
      Endereco: client.address || "",
      Observacoes: client.notes || "",
      Consentimento_LGPD: client.lgpd_consent ? "Sim" : "Não",
      Data_Consentimento_LGPD: client.lgpd_consent_date 
        ? format(new Date(client.lgpd_consent_date), "dd/MM/yyyy", { locale: ptBR }) 
        : "",
      Criado_Em: format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR }),
      Atualizado_Em: format(new Date(client.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    };
  });
  exportToExcel(dataToExport, `contatos-${getFormattedDate()}`, "Contatos");
  toast({ title: "Contatos exportados com sucesso" });
};
```

---

## 2. Exportação Excel do Material Comercial

### Situação Atual
- Existe apenas PDF comercial em `GlobalAdminSettings.tsx` (linha 557-566)
- Os dados dos planos estão exportados em `commercialPdfGenerator.ts` (PLANS e FEATURE_SECTIONS)

### Solução
Criar função de exportação Excel no `commercialPdfGenerator.ts` e adicionar botão na interface.

### Alteração no Arquivo: `src/lib/commercialPdfGenerator.ts`

Adicionar nova função no final do arquivo:

```typescript
export function exportCommercialToExcel(): void {
  const plansData = PLANS.map((plan) => ({
    Plano: plan.name,
    Preco_Mensal: formatCurrency(plan.price),
    Preco_Anual: formatCurrency(plan.annualPrice),
    Publico_Alvo: plan.targetAudience,
    Usuarios: plan.limits.users,
    Conversas_IA: plan.limits.aiConversations,
    Minutos_Audio: plan.limits.audioMinutes,
    Conexoes_WhatsApp: plan.limits.whatsappConnections,
    Agentes_IA: plan.limits.aiAgents,
    Workspaces: plan.limits.workspaces,
    Diferenciais: plan.differentials.join('; '),
    Destaque: plan.isFeatured ? 'Sim' : 'Não',
  }));

  const featuresData: { Categoria: string; Funcionalidade: string }[] = [];
  FEATURE_SECTIONS.forEach((section) => {
    section.features.forEach((feature) => {
      featuresData.push({
        Categoria: section.title,
        Funcionalidade: feature,
      });
    });
  });

  // Use exportMultiSheetExcel from exportUtils
  exportMultiSheetExcel(
    [
      { name: 'Planos', data: plansData },
      { name: 'Funcionalidades', data: featuresData },
    ],
    `MiauChat-Catalogo-Comercial-${new Date().toISOString().split('T')[0]}`
  );
}
```

### Alteração no Arquivo: `src/pages/global-admin/GlobalAdminSettings.tsx`

1. Atualizar import para incluir a nova função:
```typescript
import { generateCommercialPDF, exportCommercialToExcel } from "@/lib/commercialPdfGenerator";
```

2. Adicionar botão de Excel ao lado do PDF (após linha 566):
```tsx
<div className="flex items-center justify-between p-4 border border-primary/20 rounded-lg bg-primary/5">
  <div>
    <p className="font-medium">PDF Comercial Completo</p>
    <p className="text-sm text-muted-foreground">
      Catálogo de planos, valores e todas as funcionalidades do sistema (~10 páginas)
    </p>
  </div>
  <div className="flex gap-2">
    <Button 
      variant="outline"
      onClick={() => {
        exportCommercialToExcel();
        toast.success("Excel comercial gerado com sucesso!");
      }}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Exportar Excel
    </Button>
    <Button 
      onClick={() => {
        generateCommercialPDF();
        toast.success("PDF comercial gerado com sucesso!");
      }}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Gerar PDF
    </Button>
  </div>
</div>
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Contacts.tsx` | Expandir `handleExport` com campos adicionais |
| `src/lib/commercialPdfGenerator.ts` | Adicionar função `exportCommercialToExcel` + import do `exportUtils` |
| `src/pages/global-admin/GlobalAdminSettings.tsx` | Adicionar botão de Excel ao lado do PDF |

---

## Resultado Esperado

### Exportação de Clientes
| Antes | Depois |
|-------|--------|
| 9 campos básicos | 14 campos completos |
| Sem responsável | Com responsável |
| Sem conexão | Com conexão WhatsApp |
| Sem LGPD | Com consentimento LGPD |

### Material Comercial
| Antes | Depois |
|-------|--------|
| Apenas PDF | PDF + Excel |
| Um botão | Dois botões lado a lado |

### Excel Comercial (2 abas)
- **Aba "Planos"**: Nome, preços, limites, diferenciais
- **Aba "Funcionalidades"**: Categoria + funcionalidade detalhada

---

## Risco de Quebra

**Muito Baixo**
- Alterações isoladas em funções de exportação
- Nenhuma alteração em lógica de dados ou banco
- Fallback: funções existentes continuam funcionando

