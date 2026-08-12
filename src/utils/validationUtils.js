/**
 * Utilitários para validação de dados, sanitização de caracteres incertos (?) e regras de negócio.
 */

/**
 * Valida se uma string no formato DD/MM/YYYY ou DD/MM é uma data real e possível.
 * Datas como 38/07 ou mês 13 retornam false.
 * @param {string} dateStr 
 * @returns {boolean}
 */
export function isValidDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (dateStr.includes('?')) return false;

  const parts = dateStr.trim().split(/[/.-]/);
  if (parts.length < 2) return false;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parts[2] ? parseInt(parts[2], 10) : 2024;

  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Validação estrita de dias por mês
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/**
 * Substitui caracteres de um texto por '?' se a confiança OCR for abaixo do limite.
 * @param {string} text 
 * @param {number} confidence Score entre 0 e 1
 * @param {number} threshold Limite mínimo de confiança (default 0.7)
 * @returns {string}
 */
export function applyUncertainty(text, confidence, threshold = 0.7) {
  if (!text) return '';
  if (confidence === undefined || confidence === null || confidence >= threshold) {
    return text;
  }
  // Se a confiança for baixa, mascara caracteres alfanuméricos com '?'
  return text.replace(/[a-zA-Z0-9]/g, '?');
}

/**
 * Normaliza um horário bruto para o formato HH:MM (24 horas).
 * Preserva caracteres '?' caso existam na entrada.
 * @param {string} timeRaw 
 * @returns {string}
 */
export function normalizeTimeHHMM(timeRaw) {
  if (!timeRaw || typeof timeRaw !== 'string') return '??:??';
  
  const cleaned = timeRaw.trim().replace(/[^\d:?]/g, '');
  if (cleaned.includes('?')) {
    return cleaned;
  }

  const parts = cleaned.split(':');
  if (parts.length === 2) {
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Tenta extrair 4 dígitos (ex: "0825" -> "08:25")
  if (cleaned.length === 4 && /^\d+$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
  }

  return timeRaw;
}

/**
 * Formata um valor monetário para string no formato brasileiro (ex: "2.389,77").
 * @param {string|number} rawValue 
 * @returns {string}
 */
export function formatMoneyString(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }
  if (typeof rawValue === 'number') {
    return rawValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(rawValue);
}

/**
 * Identifica se a lista de batidas tem um número ímpar de marcações (alerta de batida ímpar).
 * @param {Array} punches 
 * @returns {boolean}
 */
export function hasOddPunches(punches) {
  return Array.isArray(punches) && punches.length % 2 !== 0;
}
