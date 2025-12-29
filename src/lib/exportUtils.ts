import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface ExportData {
  [key: string]: string | number | boolean | null | undefined;
}

interface ChartData {
  name: string;
  [key: string]: string | number;
}

interface DashboardExportData {
  metrics: {
    empresas: number;
    usuarios: number;
    conexoes: number;
    mensagens: number;
    conversas: number;
    mrr: number;
  };
  chartData?: ChartData[];
  pieData?: { name: string; value: number }[];
  barData?: { name: string; value: number }[];
}

// Export data to Excel
export function exportToExcel<T extends ExportData>(
  data: T[],
  filename: string,
  sheetName: string = 'Dados'
) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Auto-size columns
  const maxWidth = 50;
  const colWidths = Object.keys(data[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  worksheet['!cols'] = colWidths;
  
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// Export multiple sheets to Excel
export function exportMultiSheetExcel(
  sheets: { name: string; data: ExportData[] }[],
  filename: string
) {
  const workbook = XLSX.utils.book_new();
  
  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });
  
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// Export dashboard data to PDF
export function exportDashboardToPDF(
  data: DashboardExportData,
  filename: string = 'dashboard-report'
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('MiauChat - Relatório do Dashboard', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' });
  
  // Divider
  doc.setDrawColor(200);
  doc.line(20, 35, pageWidth - 20, 35);
  
  // Metrics Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Métricas Gerais', 20, 45);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  const metrics = [
    { label: 'Total de Empresas', value: data.metrics.empresas },
    { label: 'Usuários Totais', value: data.metrics.usuarios },
    { label: 'Conexões WhatsApp', value: data.metrics.conexoes },
    { label: 'Total de Mensagens', value: data.metrics.mensagens.toLocaleString('pt-BR') },
    { label: 'Total de Conversas', value: data.metrics.conversas.toLocaleString('pt-BR') },
    { label: 'MRR (Receita Mensal)', value: `R$ ${data.metrics.mrr.toLocaleString('pt-BR')}` },
  ];
  
  let yPos = 55;
  metrics.forEach((metric, index) => {
    const xPos = index % 2 === 0 ? 20 : pageWidth / 2;
    if (index % 2 === 0 && index > 0) yPos += 12;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${metric.label}:`, xPos, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(metric.value), xPos + 55, yPos);
  });
  
  yPos += 25;
  
  // Pie Chart Data
  if (data.pieData && data.pieData.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Status das Empresas', 20, yPos);
    
    yPos += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    data.pieData.forEach((item) => {
      doc.text(`• ${item.name}: ${item.value}%`, 25, yPos);
      yPos += 8;
    });
    
    yPos += 10;
  }
  
  // Bar Chart Data
  if (data.barData && data.barData.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Distribuição por Plano', 20, yPos);
    
    yPos += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    data.barData.forEach((item) => {
      doc.text(`• ${item.name}: ${item.value} empresas`, 25, yPos);
      yPos += 8;
    });
    
    yPos += 10;
  }
  
  // Chart Data Table
  if (data.chartData && data.chartData.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados de Crescimento', 20, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    
    // Table Header
    doc.setFont('helvetica', 'bold');
    doc.text('Mês', 25, yPos);
    doc.text('Empresas', 60, yPos);
    doc.text('Mensagens', 100, yPos);
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    
    data.chartData.forEach((row) => {
      doc.text(String(row.name), 25, yPos);
      doc.text(String(row.empresas || 0), 60, yPos);
      doc.text(String(row.mensagens || 0), 100, yPos);
      yPos += 7;
    });
  }
  
  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('MiauChat SaaS - Relatório Confidencial', pageWidth / 2, pageHeight - 10, { align: 'center' });
  
  doc.save(`${filename}.pdf`);
}

// Export table data to PDF
export function exportTableToPDF<T extends ExportData>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  title: string,
  filename: string
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' });
  
  // Table
  const startY = 40;
  const cellPadding = 3;
  const colWidth = (pageWidth - 40) / columns.length;
  
  // Header row
  doc.setFillColor(240, 240, 240);
  doc.rect(20, startY - 5, pageWidth - 40, 10, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  columns.forEach((col, index) => {
    doc.text(col.label, 20 + (index * colWidth) + cellPadding, startY + 2);
  });
  
  // Data rows
  doc.setFont('helvetica', 'normal');
  let yPos = startY + 15;
  
  data.slice(0, 30).forEach((row) => {
    columns.forEach((col, index) => {
      const value = String(row[col.key] ?? '');
      const truncated = value.length > 20 ? value.substring(0, 17) + '...' : value;
      doc.text(truncated, 20 + (index * colWidth) + cellPadding, yPos);
    });
    yPos += 8;
    
    // Check for page break
    if (yPos > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPos = 20;
    }
  });
  
  doc.save(`${filename}.pdf`);
}

// Utility to format date for filenames
export function getFormattedDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
