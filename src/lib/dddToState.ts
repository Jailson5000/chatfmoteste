// Mapping of Brazilian DDD (area codes) to state abbreviations
export const DDD_TO_STATE: Record<string, string> = {
  // Acre (AC)
  '68': 'AC',
  // Alagoas (AL)
  '82': 'AL',
  // Amapá (AP)
  '96': 'AP',
  // Amazonas (AM)
  '92': 'AM',
  '97': 'AM',
  // Bahia (BA)
  '71': 'BA',
  '73': 'BA',
  '74': 'BA',
  '75': 'BA',
  '77': 'BA',
  // Ceará (CE)
  '85': 'CE',
  '88': 'CE',
  // Distrito Federal (DF)
  '61': 'DF',
  // Espírito Santo (ES)
  '27': 'ES',
  '28': 'ES',
  // Goiás (GO)
  '62': 'GO',
  '64': 'GO',
  // Maranhão (MA)
  '98': 'MA',
  '99': 'MA',
  // Mato Grosso (MT)
  '65': 'MT',
  '66': 'MT',
  // Mato Grosso do Sul (MS)
  '67': 'MS',
  // Minas Gerais (MG)
  '31': 'MG',
  '32': 'MG',
  '33': 'MG',
  '34': 'MG',
  '35': 'MG',
  '37': 'MG',
  '38': 'MG',
  // Pará (PA)
  '91': 'PA',
  '93': 'PA',
  '94': 'PA',
  // Paraíba (PB)
  '83': 'PB',
  // Paraná (PR)
  '41': 'PR',
  '42': 'PR',
  '43': 'PR',
  '44': 'PR',
  '45': 'PR',
  '46': 'PR',
  // Pernambuco (PE)
  '81': 'PE',
  '87': 'PE',
  // Piauí (PI)
  '86': 'PI',
  '89': 'PI',
  // Rio de Janeiro (RJ)
  '21': 'RJ',
  '22': 'RJ',
  '24': 'RJ',
  // Rio Grande do Norte (RN)
  '84': 'RN',
  // Rio Grande do Sul (RS)
  '51': 'RS',
  '53': 'RS',
  '54': 'RS',
  '55': 'RS',
  // Rondônia (RO)
  '69': 'RO',
  // Roraima (RR)
  '95': 'RR',
  // Santa Catarina (SC)
  '47': 'SC',
  '48': 'SC',
  '49': 'SC',
  // São Paulo (SP)
  '11': 'SP',
  '12': 'SP',
  '13': 'SP',
  '14': 'SP',
  '15': 'SP',
  '16': 'SP',
  '17': 'SP',
  '18': 'SP',
  '19': 'SP',
  // Sergipe (SE)
  '79': 'SE',
  // Tocantins (TO)
  '63': 'TO',
};

/**
 * Extract DDD from a Brazilian phone number
 * Supports formats: +55DDXXXXXXXXX, 55DDXXXXXXXXX, DDXXXXXXXXX, (DD) XXXXX-XXXX, etc.
 */
export function extractDDD(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  const digits = phone.replace(/\D/g, '');
  
  // If starts with country code 55, remove it
  const withoutCountry = digits.startsWith('55') && digits.length > 11 
    ? digits.slice(2) 
    : digits;
  
  // DDD should be the first 2 digits (if phone has at least 10 digits)
  if (withoutCountry.length >= 10) {
    return withoutCountry.slice(0, 2);
  }
  
  return null;
}

/**
 * Get state abbreviation from phone number
 */
export function getStateFromPhone(phone: string | null | undefined): string | null {
  const ddd = extractDDD(phone);
  if (!ddd) return null;
  return DDD_TO_STATE[ddd] || null;
}
