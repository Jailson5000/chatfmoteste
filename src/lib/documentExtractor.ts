import * as XLSX from 'xlsx';

export interface ExtractionResult {
  content: string | null;
  error?: string;
  supported: boolean;
  format?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 500; // Limit rows for large spreadsheets

/**
 * Extract text content from Excel files (.xlsx, .xls)
 */
async function extractExcelContent(file: File): Promise<ExtractionResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    let fullText = '';
    let totalRows = 0;
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      
      // Limit rows if too large
      const limitedRange = { ...range };
      if (rowCount > MAX_ROWS) {
        limitedRange.e.r = range.s.r + MAX_ROWS - 1;
      }
      
      const csv = XLSX.utils.sheet_to_csv(sheet, { 
        FS: ',', 
        RS: '\n',
        ...(rowCount > MAX_ROWS ? { range: limitedRange } : {})
      });
      
      fullText += `=== Planilha: ${sheetName} ===\n${csv}\n\n`;
      totalRows += Math.min(rowCount, MAX_ROWS);
    });
    
    if (totalRows >= MAX_ROWS) {
      fullText += `\n[Nota: Arquivo grande - exibindo primeiras ${MAX_ROWS} linhas por planilha]\n`;
    }
    
    return { 
      content: fullText.trim(), 
      supported: true, 
      format: 'excel' 
    };
  } catch (error) {
    console.error('Error extracting Excel content:', error);
    return { 
      content: null, 
      supported: true, 
      error: 'Erro ao processar arquivo Excel',
      format: 'excel'
    };
  }
}

/**
 * Extract text content from CSV files
 */
async function extractCsvContent(file: File): Promise<ExtractionResult> {
  try {
    const text = await file.text();
    const lines = text.split('\n');
    
    // Limit rows if too large
    const limitedText = lines.length > MAX_ROWS 
      ? lines.slice(0, MAX_ROWS).join('\n') + `\n\n[Nota: Arquivo grande - exibindo primeiras ${MAX_ROWS} linhas]`
      : text;
    
    return { 
      content: limitedText.trim(), 
      supported: true,
      format: 'csv'
    };
  } catch (error) {
    console.error('Error extracting CSV content:', error);
    return { 
      content: null, 
      supported: true, 
      error: 'Erro ao processar arquivo CSV',
      format: 'csv'
    };
  }
}

/**
 * Extract text content from DOCX files
 * DOCX is a ZIP file containing XML files
 */
async function extractDocxContent(file: File): Promise<ExtractionResult> {
  try {
    const JSZip = (await import('jszip')).default;
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    // Get the main document content
    const documentXml = await zip.file('word/document.xml')?.async('string');
    
    if (!documentXml) {
      return { 
        content: null, 
        supported: true, 
        error: 'Documento Word inválido ou corrompido',
        format: 'docx'
      };
    }
    
    // Parse XML and extract text
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
    
    // Extract all text nodes from <w:t> elements (Word text elements)
    const textNodes = xmlDoc.getElementsByTagName('w:t');
    const paragraphs: string[] = [];
    let currentParagraph = '';
    
    // Also track paragraph breaks
    const allNodes = xmlDoc.getElementsByTagName('*');
    
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      
      if (node.tagName === 'w:p') {
        // New paragraph
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
        }
        currentParagraph = '';
      } else if (node.tagName === 'w:t') {
        currentParagraph += node.textContent || '';
      } else if (node.tagName === 'w:tab') {
        currentParagraph += '\t';
      } else if (node.tagName === 'w:br') {
        currentParagraph += '\n';
      }
    }
    
    // Don't forget the last paragraph
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
    
    const fullText = paragraphs.join('\n\n');
    
    if (!fullText.trim()) {
      return { 
        content: null, 
        supported: true, 
        error: 'Documento Word está vazio ou contém apenas imagens',
        format: 'docx'
      };
    }
    
    return { 
      content: fullText.trim(), 
      supported: true,
      format: 'docx'
    };
  } catch (error) {
    console.error('Error extracting DOCX content:', error);
    return { 
      content: null, 
      supported: true, 
      error: 'Erro ao processar documento Word',
      format: 'docx'
    };
  }
}

/**
 * Extract text content from plain text files
 */
async function extractTextContent(file: File): Promise<ExtractionResult> {
  try {
    const text = await file.text();
    return { 
      content: text.trim(), 
      supported: true,
      format: 'text'
    };
  } catch (error) {
    console.error('Error extracting text content:', error);
    return { 
      content: null, 
      supported: true, 
      error: 'Erro ao processar arquivo de texto',
      format: 'text'
    };
  }
}

/**
 * Main function to extract content from various document types
 */
export async function extractDocumentContent(file: File): Promise<ExtractionResult> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { 
      content: null, 
      supported: false, 
      error: `Arquivo muito grande (máximo ${MAX_FILE_SIZE / 1024 / 1024}MB)` 
    };
  }
  
  const ext = file.name.toLowerCase().split('.').pop();
  
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return extractExcelContent(file);
      
    case 'csv':
      return extractCsvContent(file);
      
    case 'docx':
      return extractDocxContent(file);
      
    case 'doc':
      // Old .doc format is binary and much harder to parse
      return { 
        content: null, 
        supported: false, 
        error: 'Formato .doc antigo não suportado. Por favor, converta para .docx',
        format: 'doc'
      };
      
    case 'txt':
    case 'md':
    case 'json':
      return extractTextContent(file);
      
    case 'pdf':
      return { 
        content: null, 
        supported: false, 
        error: 'PDFs ainda não suportam extração automática de texto. O arquivo será salvo, mas a IA não conseguirá ler seu conteúdo.',
        format: 'pdf'
      };
      
    default:
      return { 
        content: null, 
        supported: false,
        error: `Formato .${ext} não suportado para extração de texto`
      };
  }
}

/**
 * Get a human-readable description of supported formats
 */
export function getSupportedFormatsDescription(): string {
  return 'Excel (.xlsx, .xls), Word (.docx), CSV, TXT, MD, JSON | PDF (somente armazenamento)';
}
