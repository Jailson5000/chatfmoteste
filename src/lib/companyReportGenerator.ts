import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { exportToExcel, getFormattedDate } from "./exportUtils";

interface CompanyReportData {
  name: string;
  document: string | null;
  planName: string;
  status: string;
  approvalStatus: string;
  isActive: boolean;
  approvedAt: string | null;
  trialDaysRemaining: number | null;
  openInvoicesCount: number;
  openInvoicesTotal: number;
  // Novos campos de billing
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  lastPaymentAt: string | null;
  nextInvoiceAt: string | null;
}

interface ReportConfig {
  companies: CompanyReportData[];
  generatedAt: Date;
}

const PRIMARY_COLOR: [number, number, number] = [225, 29, 72]; // #E11D48
const TEXT_COLOR: [number, number, number] = [30, 30, 30];
const MUTED_COLOR: [number, number, number] = [100, 100, 100];
const HEADER_BG: [number, number, number] = [245, 245, 245];

function getStatusText(company: CompanyReportData): string {
  // 1. Status de bloqueio tem prioridade máxima
  if (company.status === "suspended") return "Suspenso";
  if (company.status === "blocked") return "Bloqueado";
  if (company.approvalStatus === "pending") return "Pendente";
  
  // 2. Se tem subscription ativa = é pagante (ignora trial_ends_at)
  if (company.hasActiveSubscription) {
    return "Ativo";
  }
  
  // 3. Se está em trial
  if (company.trialDaysRemaining !== null) {
    if (company.trialDaysRemaining > 0) {
      return `Trial (${company.trialDaysRemaining}d)`;
    } else {
      return "Trial Expirado";
    }
  }
  
  // 4. Fallback
  if (company.status === "active") return "Ativo";
  return company.status;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100); // Stripe returns cents
}

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "-";
  }
}

export function generateCompanyReportPDF(config: ReportConfig): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Header
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 25, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Empresas Cadastradas", margin, 16);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Gerado em: ${format(config.generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageWidth - margin,
    16,
    { align: "right" }
  );

  // Company info
  doc.setTextColor(...MUTED_COLOR);
  doc.setFontSize(8);
  doc.text("MiauChat - CNPJ: 54.440.907/0001-02", margin, 32);
  doc.text("www.miauchat.com.br | contato@miauchat.com.br", margin, 36);

  // Table header
  const startY = 45;
  // Updated column widths for 9 columns (adjusted to fit landscape A4)
  const colWidths = [50, 38, 32, 28, 18, 28, 28, 28, 32];
  const headers = ["Nome", "CPF/CNPJ", "Plano", "Status", "Ativo", "Ativação", "Últ. Pgto", "Próx. Fat.", "Faturas"];

  doc.setFillColor(...HEADER_BG);
  doc.rect(margin, startY, pageWidth - margin * 2, 8, "F");

  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  let xPos = margin + 2;
  headers.forEach((header, i) => {
    doc.text(header, xPos, startY + 5.5);
    xPos += colWidths[i];
  });

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  let yPos = startY + 12;
  const rowHeight = 7;

  config.companies.forEach((company, index) => {
    // Check if we need a new page
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 20;
      
      // Add header on new page
      doc.setFillColor(...HEADER_BG);
      doc.rect(margin, yPos - 5, pageWidth - margin * 2, 8, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let headerX = margin + 2;
      headers.forEach((header, i) => {
        doc.text(header, headerX, yPos);
        headerX += colWidths[i];
      });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      yPos += 7;
    }

    // Alternate row background
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, yPos - 4, pageWidth - margin * 2, rowHeight, "F");
    }

    doc.setTextColor(...TEXT_COLOR);
    xPos = margin + 2;

    // Name (truncate if too long)
    const name = company.name.length > 25 ? company.name.substring(0, 22) + "..." : company.name;
    doc.text(name, xPos, yPos);
    xPos += colWidths[0];

    // Document
    doc.text(company.document || "-", xPos, yPos);
    xPos += colWidths[1];

    // Plan
    doc.text(company.planName || "-", xPos, yPos);
    xPos += colWidths[2];

    // Status
    const statusText = getStatusText(company);
    if (statusText.includes("Expirado") || statusText === "Suspenso" || statusText === "Bloqueado") {
      doc.setTextColor(220, 38, 38); // red
    } else if (statusText.includes("Trial") || statusText === "Pendente") {
      doc.setTextColor(202, 138, 4); // yellow
    } else {
      doc.setTextColor(34, 197, 94); // green
    }
    doc.text(statusText, xPos, yPos);
    doc.setTextColor(...TEXT_COLOR);
    xPos += colWidths[3];

    // Active
    doc.text(company.isActive ? "Sim" : "Não", xPos, yPos);
    xPos += colWidths[4];

    // Approved at (Ativação)
    doc.text(formatDateBR(company.approvedAt), xPos, yPos);
    xPos += colWidths[5];

    // Last Payment (Últ. Pgto)
    doc.text(formatDateBR(company.lastPaymentAt), xPos, yPos);
    xPos += colWidths[6];

    // Next Invoice (Próx. Fat.)
    doc.text(formatDateBR(company.nextInvoiceAt), xPos, yPos);
    xPos += colWidths[7];

    // Faturas (combined count + total)
    if (company.openInvoicesCount > 0) {
      doc.setTextColor(220, 38, 38);
      const invoiceText = `${company.openInvoicesCount} (${formatCurrency(company.openInvoicesTotal)})`;
      doc.text(invoiceText, xPos, yPos);
      doc.setTextColor(...TEXT_COLOR);
    } else {
      doc.text("-", xPos, yPos);
    }

    yPos += rowHeight;
  });

  // Summary
  yPos += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total de empresas: ${config.companies.length}`, margin, yPos);

  const activeCount = config.companies.filter(c => c.isActive && c.status === "active").length;
  const trialCount = config.companies.filter(c => c.trialDaysRemaining !== null && c.trialDaysRemaining > 0).length;
  const pendingCount = config.companies.filter(c => c.approvalStatus === "pending").length;
  const withOpenInvoices = config.companies.filter(c => c.openInvoicesCount > 0).length;
  const totalPending = config.companies.reduce((sum, c) => sum + c.openInvoicesTotal, 0);

  doc.setFont("helvetica", "normal");
  doc.text(`Ativas: ${activeCount} | Em Trial: ${trialCount} | Pendentes: ${pendingCount}`, margin + 80, yPos);
  
  if (withOpenInvoices > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text(`Com faturas em aberto: ${withOpenInvoices} (${formatCurrency(totalPending)})`, margin + 180, yPos);
    doc.setTextColor(...TEXT_COLOR);
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(
    "Este documento é um relatório interno de gestão e não constitui Nota Fiscal Eletrônica (NFS-e).",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );
  doc.text(
    "MiauChat - Documento Confidencial",
    pageWidth / 2,
    pageHeight - 6,
    { align: "center" }
  );

  // Save
  const filename = `empresas-miauchat-${format(config.generatedAt, "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}

export function exportCompanyReportToExcel(config: ReportConfig): void {
  const data = config.companies.map((company) => {
    // Calcular status real (mesma lógica do PDF)
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
      Data_Ativacao: company.approvedAt 
        ? format(new Date(company.approvedAt), "dd/MM/yyyy", { locale: ptBR }) 
        : "-",
      Ultimo_Pagamento: company.lastPaymentAt 
        ? format(new Date(company.lastPaymentAt), "dd/MM/yyyy", { locale: ptBR }) 
        : "-",
      Proxima_Fatura: company.nextInvoiceAt 
        ? format(new Date(company.nextInvoiceAt), "dd/MM/yyyy", { locale: ptBR }) 
        : "-",
      Faturas_Abertas: company.openInvoicesCount > 0 
        ? `${company.openInvoicesCount} (R$ ${(company.openInvoicesTotal / 100).toFixed(2).replace('.', ',')})`
        : "-",
      Status_Assinatura: company.subscriptionStatus || "-",
      Trial_Dias_Restantes: company.trialDaysRemaining ?? "-",
    };
  });

  exportToExcel(data, `empresas-miauchat-${getFormattedDate()}`, 'Empresas');
}

export type { CompanyReportData, ReportConfig };
