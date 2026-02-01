
# Plano: Botão de Exportar Empresas em PDF

## Objetivo

Adicionar um botão "Exportar PDF" no cabeçalho da página de Empresas do Global Admin que gera um relatório completo com todas as empresas e suas informações.

## Dados a Exportar

| Campo | Origem | Formato |
|-------|--------|---------|
| Nome | `company.name` | Texto |
| Email | `company.email` | Texto |
| CPF/CNPJ | `company.document` | Formatado (XX.XXX.XXX/XXXX-XX) |
| Telefone | `company.phone` | Formatado ((XX) XXXXX-XXXX) |
| Plano | `company.plan?.name` | Nome do plano |
| Status | `company.status` | Ativa / Trial / Suspensa |
| Situação Trial | `company.trial_ends_at` | Data ou "N/A" |
| Criado em | `company.created_at` | DD/MM/YYYY |

## Layout do PDF

```text
┌─────────────────────────────────────────────────────────────────┐
│                    MiauChat - Relatório de Empresas             │
│                    Gerado em: 01/02/2026 às 14:30               │
├─────────────────────────────────────────────────────────────────┤
│  Resumo: 45 empresas | 38 ativas | 5 trial | 2 suspensas        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EMPRESA 1                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  Nome: Acme Ltda                                                │
│  Email: contato@acme.com.br                                     │
│  CPF/CNPJ: 12.345.678/0001-90                                   │
│  Telefone: (11) 99999-9999                                      │
│  Plano: Professional                                            │
│  Status: ✓ Ativa                                                │
│  Criado em: 15/01/2026                                          │
│                                                                 │
│  EMPRESA 2                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  ...                                                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              MiauChat SaaS - Relatório Confidencial             │
└─────────────────────────────────────────────────────────────────┘
```

## Alterações Técnicas

### 1. Arquivo: `src/lib/exportUtils.ts`

Adicionar nova função `exportCompaniesToPDF`:

```typescript
interface CompanyExportData {
  id: string;
  name: string;
  email: string | null;
  document: string | null;
  phone: string | null;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
}

export function exportCompaniesToPDF(
  companies: CompanyExportData[],
  filename: string = 'empresas-miauchat'
) {
  // Gera PDF com layout profissional
  // Múltiplas páginas se necessário
  // Inclui resumo no topo
}
```

### 2. Arquivo: `src/pages/global-admin/GlobalAdminCompanies.tsx`

Adicionar botão na área de ações do cabeçalho (linha ~566-608):

```typescript
import { FileDown } from "lucide-react";
import { exportCompaniesToPDF, getFormattedDate } from "@/lib/exportUtils";

// Na área de botões, adicionar:
<Button
  variant="outline"
  onClick={handleExportPDF}
>
  <FileDown className="mr-2 h-4 w-4" />
  Exportar PDF
</Button>
```

Função de exportação:

```typescript
const handleExportPDF = () => {
  const exportData = approvedCompanies.map(company => ({
    id: company.id,
    name: company.name,
    email: company.email,
    document: company.document,
    phone: company.phone,
    planName: company.plan?.name || 'Sem plano',
    status: statusLabels[company.status] || company.status,
    trialEndsAt: company.trial_ends_at,
    createdAt: company.created_at,
  }));
  
  exportCompaniesToPDF(exportData, `empresas-${getFormattedDate()}`);
  toast.success(`PDF exportado com ${exportData.length} empresas`);
};
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/exportUtils.ts` | Adicionar função `exportCompaniesToPDF` |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Importar função e adicionar botão + handler |

## Resultado Esperado

1. Botão "Exportar PDF" aparece ao lado dos outros botões de ação
2. Ao clicar, gera PDF com todas as empresas aprovadas
3. PDF inclui resumo de totais no topo
4. Suporta múltiplas páginas automaticamente
5. Download imediato do arquivo
