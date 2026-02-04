import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  if (company.status === "suspended") return "Suspenso";
  if (company.status === "blocked") return "Bloqueado";
  if (company.approvalStatus === "pending") return "Pendente";
  if (company.trialDaysRemaining !== null && company.trialDaysRemaining > 0) {
    return `Trial (${company.trialDaysRemaining}d)`;
  }
  if (company.trialDaysRemaining !== null && company.trialDaysRemaining <= 0) {
    return "Trial Expirado";
  }
  if (company.status === "active") return "Ativo";
  return company.status;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100); // Stripe returns cents
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
  const colWidths = [55, 40, 35, 30, 22, 35, 30, 35];
  const headers = ["Nome", "CPF/CNPJ", "Plano", "Status", "Ativo", "Ativação", "Faturas", "Valor Pendente"];

  doc.setFillColor(...HEADER_BG);
  doc.rect(margin, startY, pageWidth - margin * 2, 8, "F");

  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(8);
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

    // Approved at
    doc.text(
      company.approvedAt 
        ? format(new Date(company.approvedAt), "dd/MM/yyyy", { locale: ptBR })
        : "-",
      xPos,
      yPos
    );
    xPos += colWidths[5];

    // Open invoices count
    if (company.openInvoicesCount > 0) {
      doc.setTextColor(220, 38, 38);
    }
    doc.text(company.openInvoicesCount.toString(), xPos, yPos);
    doc.setTextColor(...TEXT_COLOR);
    xPos += colWidths[6];

    // Open invoices total
    if (company.openInvoicesTotal > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(formatCurrency(company.openInvoicesTotal), xPos, yPos);
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

export type { CompanyReportData };
