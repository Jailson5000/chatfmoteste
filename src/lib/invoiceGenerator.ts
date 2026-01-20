import jsPDF from 'jspdf';
import { formatCurrency, AdditionalBreakdown, ADDITIONAL_PRICING } from './billing-config';
import { getFormattedDate } from './exportUtils';

interface InvoiceData {
  companyName: string;
  companyDocument?: string;
  companyEmail?: string;
  planName: string;
  planPrice: number;
  billingPeriod: string;
  breakdown: AdditionalBreakdown;
  totalMonthly: number;
  usage?: {
    users: { current: number; max: number };
    instances: { current: number; max: number };
    agents: { current: number; max: number };
    aiConversations: { current: number; max: number };
    ttsMinutes: { current: number; max: number };
  };
}

export function generateInvoicePDF(data: InvoiceData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  
  let yPos = 20;

  // Header - Company Logo/Name
  doc.setFillColor(45, 55, 72); // Dark gray
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('MiauChat', margin, 28);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Atendimento Inteligente', margin, 36);

  // Invoice Title
  doc.setFontSize(12);
  doc.text('FATURA', pageWidth - margin - 30, 28);
  
  yPos = 60;
  doc.setTextColor(0, 0, 0);

  // Invoice Info Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, yPos - 5, contentWidth, 35, 3, 3, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados da Fatura', margin + 5, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  const invoiceNumber = `FAT-${Date.now().toString().slice(-8)}`;
  const issueDate = new Date().toLocaleDateString('pt-BR');
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
  
  doc.text(`Número: ${invoiceNumber}`, margin + 5, yPos + 15);
  doc.text(`Emissão: ${issueDate}`, margin + 5, yPos + 23);
  
  doc.text(`Período: ${data.billingPeriod}`, pageWidth / 2, yPos + 15);
  doc.text(`Vencimento: ${dueDate}`, pageWidth / 2, yPos + 23);

  yPos += 45;

  // Client Info
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, yPos - 5, contentWidth, 30, 3, 3, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', margin + 5, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.companyName, margin + 5, yPos + 15);
  
  if (data.companyDocument) {
    doc.text(`CNPJ/CPF: ${data.companyDocument}`, margin + 5, yPos + 22);
  }
  if (data.companyEmail) {
    doc.text(`Email: ${data.companyEmail}`, pageWidth / 2, yPos + 15);
  }

  yPos += 40;

  // Table Header
  doc.setFillColor(45, 55, 72);
  doc.rect(margin, yPos, contentWidth, 10, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Descrição', margin + 5, yPos + 7);
  doc.text('Qtd', pageWidth - margin - 60, yPos + 7);
  doc.text('Valor', pageWidth - margin - 25, yPos + 7);

  yPos += 12;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // Table Rows
  const drawTableRow = (description: string, quantity: string, value: string, isAlternate: boolean) => {
    if (isAlternate) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos - 4, contentWidth, 10, 'F');
    }
    doc.setFontSize(9);
    doc.text(description, margin + 5, yPos + 3);
    doc.text(quantity, pageWidth - margin - 60, yPos + 3);
    doc.text(value, pageWidth - margin - 25, yPos + 3);
    yPos += 10;
  };

  // Plan
  drawTableRow(`Plano ${data.planName}`, '1', formatCurrency(data.planPrice), false);

  // Additional Users
  if (data.breakdown.users.quantity > 0) {
    drawTableRow(
      `Usuários adicionais (${formatCurrency(ADDITIONAL_PRICING.user)}/cada)`,
      String(data.breakdown.users.quantity),
      formatCurrency(data.breakdown.users.cost),
      true
    );
  }

  // Additional Instances
  if (data.breakdown.instances.quantity > 0) {
    drawTableRow(
      `Conexões WhatsApp adicionais (${formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}/cada)`,
      String(data.breakdown.instances.quantity),
      formatCurrency(data.breakdown.instances.cost),
      data.breakdown.users.quantity === 0
    );
  }

  // Additional Agents
  if (data.breakdown.agents.quantity > 0) {
    drawTableRow(
      `Agentes IA adicionais`,
      String(data.breakdown.agents.quantity),
      formatCurrency(data.breakdown.agents.cost),
      (data.breakdown.users.quantity + data.breakdown.instances.quantity) % 2 === 0
    );
  }

  yPos += 5;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);

  yPos += 10;

  // Total
  doc.setFillColor(45, 55, 72);
  doc.roundedRect(pageWidth - margin - 80, yPos - 5, 80, 20, 3, 3, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', pageWidth - margin - 75, yPos + 5);
  doc.setFontSize(12);
  doc.text(formatCurrency(data.totalMonthly), pageWidth - margin - 35, yPos + 5);

  yPos += 30;
  doc.setTextColor(0, 0, 0);

  // Usage Summary (if available)
  if (data.usage) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Consumo do Período', margin, yPos);
    
    yPos += 8;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos - 3, contentWidth, 45, 3, 3, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    const usageItems = [
      { label: 'Usuários', current: data.usage.users.current, max: data.usage.users.max },
      { label: 'Conexões WhatsApp', current: data.usage.instances.current, max: data.usage.instances.max },
      { label: 'Agentes IA', current: data.usage.agents.current, max: data.usage.agents.max },
      { label: 'Conversas IA', current: data.usage.aiConversations.current, max: data.usage.aiConversations.max },
      { label: 'Minutos de Áudio', current: data.usage.ttsMinutes.current, max: data.usage.ttsMinutes.max },
    ];

    const colWidth = contentWidth / 3;
    usageItems.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const xPos = margin + 5 + col * colWidth;
      const itemYPos = yPos + 8 + row * 18;
      
      doc.setFont('helvetica', 'bold');
      doc.text(item.label, xPos, itemYPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`${item.current} / ${item.max}`, xPos, itemYPos + 8);
    });

    yPos += 55;
  }

  // Additional Pricing Info
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('Preços de consumo adicional:', margin, yPos);
  yPos += 6;
  doc.text(
    `• Conversa IA: ${formatCurrency(ADDITIONAL_PRICING.aiConversation)}  |  ` +
    `• Minuto de Áudio: ${formatCurrency(ADDITIONAL_PRICING.ttsMinute)}  |  ` +
    `• WhatsApp: ${formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}/mês  |  ` +
    `• Atendente: ${formatCurrency(ADDITIONAL_PRICING.user)}/mês`,
    margin,
    yPos
  );

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
  
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('MiauChat - Sistema de Atendimento Inteligente', pageWidth / 2, pageHeight - 20, { align: 'center' });
  doc.text('Este documento é apenas um demonstrativo. Para fins fiscais, utilize a nota fiscal oficial.', pageWidth / 2, pageHeight - 14, { align: 'center' });
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // Save
  const filename = `fatura-miauchat-${data.billingPeriod.replace(/\s/g, '-').toLowerCase()}-${getFormattedDate()}`;
  doc.save(`${filename}.pdf`);
}
