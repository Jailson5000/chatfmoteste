/**
 * Input mask utilities for Brazilian phone numbers and documents
 */

/**
 * Format phone number as (00) 00000-0000 or (00) 0000-0000
 * Input: digits without country code
 * Display: formatted without country code
 */
export function formatPhone(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  
  // Remove 55 prefix if user typed it
  const withoutCountry = digits.startsWith('55') && digits.length > 11 
    ? digits.slice(2) 
    : digits;
  
  // Limit to 11 digits (DDD + 9 digit number)
  const limited = withoutCountry.slice(0, 11);
  
  if (limited.length === 0) return '';
  if (limited.length <= 2) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  if (limited.length <= 10) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`;
  }
  // 11 digits - mobile format
  return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
}

/**
 * Format phone for storage with country code 55
 * Ensures phone is saved with Brazil country code for WhatsApp
 */
export function formatPhoneForStorage(value: string): string {
  const digits = value.replace(/\D/g, '');
  
  // If already has 55 prefix and correct length, return as is
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  
  // Add 55 prefix if not present
  return `55${digits}`;
}

/**
 * Format CPF as 000.000.000-00
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Format CNPJ as 00.000.000/0000-00
 */
export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Auto-detect and format CPF or CNPJ based on length
 */
export function formatDocument(value: string): string {
  const digits = value.replace(/\D/g, '');
  
  // If 11 or less digits, format as CPF
  if (digits.length <= 11) {
    return formatCPF(value);
  }
  // Otherwise format as CNPJ
  return formatCNPJ(value);
}

/**
 * Remove mask and return only digits
 */
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}
