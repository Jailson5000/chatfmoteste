/**
 * Parseia string de data no formato YYYY-MM-DD como horário local.
 * Evita bug de fuso horário onde new Date("2026-02-03") 
 * é interpretado como UTC e pode virar dia anterior.
 * 
 * @param dateStr - String de data no formato YYYY-MM-DD ou ISO timestamp
 * @returns Date object ou null se inválido
 */
export function parseDateLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // Se for ISO timestamp completo, usar diretamente
  if (dateStr.includes('T')) {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Se for formato YYYY-MM-DD, parsear como local
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  
  return new Date(year, month - 1, day);
}

/**
 * Formata uma data JavaScript para o formato YYYY-MM-DD preservando o dia local.
 * Evita bug de fuso horário onde toISOString() converte para UTC.
 * 
 * @param date - Objeto Date
 * @returns String no formato YYYY-MM-DD
 */
export function formatDateForDatabase(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
