

# Plano: Adicionar Exportação Excel para Empresas

## Contexto

O PDF atual do relatório de empresas (`empresas-miauchat-2026-02-06_2.pdf`) contém:
- Nome, CPF/CNPJ, Plano, Status, Ativo, Ativação, Último Pagamento, Próxima Fatura, Faturas

O usuário quer um botão Excel ao lado do PDF existente, com os mesmos dados + informações úteis para atendimento no WhatsApp.

---

## Alterações Necessárias

### Arquivo 1: `src/lib/companyReportGenerator.ts`

Adicionar nova função de exportação Excel que reutiliza os mesmos dados do PDF:

```typescript
import { exportToExcel, getFormattedDate } from './exportUtils';
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function exportCompanyReportToExcel(config: ReportConfig): void {
  const data = config.companies.map((company) => {
    // Calcular status real
    let statusFinal = company.status;
    if (company.status === "suspended") statusFinal = "Suspenso";
    else if (company.status === "blocked") statusFinal = "Bloqueado";
    else if (company.approvalStatus === "pending") statusFinal = "Pendente";
    else if (company.hasActiveSubscription) statusFinal = "Ativo";
    else if (company.trialDaysRemaining !== null) {
      statusFinal = company.trialDaysRemaining > 0 
        ? `Trial (${company.trialDaysRemaining}d)` 
        : "Trial Expirado";
    } else if (company.status === "active") statusFinal = "Ativo";

    return {
      Nome: company.name,
      CPF_CNPJ: company.document || "-",
      Plano: company.planName || "-",
      Status: statusFinal,
      Ativo: company.isActive ? "Sim" : "Não",
      Data_Ativacao: company.approvedAt ? format(new Date(company.approvedAt), "dd/MM/yyyy", { locale: ptBR }) : "-",
      Ultimo_Pagamento: company.lastPaymentAt ? format(new Date(company.lastPaymentAt), "dd/MM/yyyy", { locale: ptBR }) : "-",
      Proxima_Fatura: company.nextInvoiceAt ? format(new Date(company.nextInvoiceAt), "dd/MM/yyyy", { locale: ptBR }) : "-",
      Faturas_Abertas: company.openInvoicesCount > 0 
        ? `${company.openInvoicesCount} (R$ ${(company.openInvoicesTotal / 100).toFixed(2).replace('.', ',')})`
        : "-",
      Status_Assinatura: company.subscriptionStatus || "-",
      Trial_Dias_Restantes: company.trialDaysRemaining ?? "-",
    };
  });

  exportToExcel(data, `empresas-miauchat-${getFormattedDate()}`, 'Empresas');
}
```

### Arquivo 2: `src/pages/global-admin/GlobalAdminCompanies.tsx`

1. Atualizar import:
```typescript
import { generateCompanyReportPDF, exportCompanyReportToExcel, CompanyReportData } from "@/lib/companyReportGenerator";
```

2. Adicionar state para controle do Excel:
```typescript
const [isExportingExcel, setIsExportingExcel] = useState(false);
```

3. Adicionar botão Excel ao lado do PDF existente (linha ~662):
```tsx
{/* Export Excel Button */}
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="outline"
        onClick={async () => {
          setIsExportingExcel(true);
          try {
            // Buscar dados de billing (mesma lógica do PDF)
            const { data: { session } } = await supabase.auth.getSession();
            let billingData: Record<string, any> = {};
            
            try {
              const billingSummary = await supabase.functions.invoke('get-company-billing-summary', {
                headers: { Authorization: `Bearer ${session?.access_token}` }
              });
              if (billingSummary.data) {
                billingData = billingSummary.data;
              }
            } catch (e) {
              console.warn('Error fetching billing summary:', e);
            }
            
            // Montar dados (mesma lógica do PDF)
            const reportData: CompanyReportData[] = companies.map((company) => {
              const plan = plans.find(p => p.id === company.plan_id);
              
              let trialDaysRemaining: number | null = null;
              if (company.trial_ends_at) {
                const trialEnd = new Date(company.trial_ends_at);
                trialDaysRemaining = differenceInDays(trialEnd, new Date());
              }
              
              const billing = billingData[company.id] || {
                hasActiveSubscription: false,
                subscriptionStatus: null,
                lastPaymentAt: null,
                nextInvoiceAt: null,
                openInvoicesCount: 0,
                openInvoicesTotal: 0,
              };
              
              return {
                name: company.name,
                document: company.document,
                planName: plan?.name || 'Sem plano',
                status: company.status,
                approvalStatus: company.approval_status || 'approved',
                isActive: company.status === 'active' && company.approval_status !== 'pending_approval',
                approvedAt: company.approved_at,
                trialDaysRemaining,
                openInvoicesCount: billing.openInvoicesCount,
                openInvoicesTotal: billing.openInvoicesTotal,
                hasActiveSubscription: billing.hasActiveSubscription,
                subscriptionStatus: billing.subscriptionStatus,
                lastPaymentAt: billing.lastPaymentAt,
                nextInvoiceAt: billing.nextInvoiceAt,
              };
            });
            
            exportCompanyReportToExcel({
              companies: reportData,
              generatedAt: new Date(),
            });
            
            toast.success('Relatório Excel exportado com sucesso!');
          } catch (error) {
            console.error('Error exporting Excel:', error);
            toast.error('Erro ao exportar Excel');
          } finally {
            setIsExportingExcel(false);
          }
        }}
        disabled={isExportingExcel || companies.length === 0}
      >
        <FileText className={`mr-2 h-4 w-4 ${isExportingExcel ? 'animate-pulse' : ''}`} />
        {isExportingExcel ? 'Exportando...' : 'Exportar Excel'}
      </Button>
    </TooltipTrigger>
    <TooltipContent>Exportar relatório Excel de todas as empresas</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/companyReportGenerator.ts` | Adicionar função `exportCompanyReportToExcel` + imports |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Atualizar import + adicionar state + botão Excel |

---

## Dados Exportados no Excel

| Coluna | Descrição |
|--------|-----------|
| Nome | Nome da empresa |
| CPF_CNPJ | Documento da empresa |
| Plano | Nome do plano contratado |
| Status | Status real (Ativo/Trial/Suspenso/etc) |
| Ativo | Sim/Não |
| Data_Ativacao | Data de aprovação |
| Ultimo_Pagamento | Data do último pagamento |
| Proxima_Fatura | Data da próxima cobrança |
| Faturas_Abertas | Quantidade e valor total |
| Status_Assinatura | Status no Stripe |
| Trial_Dias_Restantes | Dias restantes de trial |

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Apenas botão "Exportar PDF" | Botões "Exportar Excel" + "Exportar PDF" |
| Excel com dados iguais ao PDF | ✅ |
| Dados úteis para atendimento WhatsApp | ✅ (nome, documento, status, plano) |

---

## Risco de Quebra

**Muito Baixo**
- Adição de nova função isolada
- Reutiliza a mesma lógica de coleta de dados do PDF
- Não altera nenhum fluxo existente

