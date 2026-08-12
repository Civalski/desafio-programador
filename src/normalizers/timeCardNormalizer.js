import { normalizeTimeHHMM, isValidDateString } from '../utils/validationUtils.js';

/**
 * Normaliza os dados brutos obtidos pelo Mindee ou OCR para o DTO oficial de Cartão de Ponto.
 * 
 * @param {Object} rawData Resposta bruta da API do Mindee ou extração tabular
 * @returns {Object} DTO formatado estritamente no contrato do sistema
 */
export function normalizeTimeCardResponse(rawData) {
  const result = {
    pages: []
  };

  if (!rawData) {
    return result;
  }

  // Trata estrutura por páginas
  const inputPages = Array.isArray(rawData.pages) ? rawData.pages : [rawData];

  inputPages.forEach((pageData, pageIndex) => {
    const pageNum = pageData.pageNumber || pageData.page || (pageIndex + 1);
    const days = [];

    const rawDays = pageData.days || pageData.lines || [];
    
    rawDays.forEach((dayItem) => {
      let dateRaw = (dayItem.date_raw || dayItem.date || '').trim();

      // Caso a data seja inválida (ex: 38/07), substitui caracteres por '?'
      if (dateRaw && !isValidDateString(dateRaw) && !dateRaw.includes('?')) {
        dateRaw = dateRaw.replace(/\d/g, '?');
      }

      const punches = [];
      const rawPunches = dayItem.punches || dayItem.times || [];

      rawPunches.forEach((punch, pIndex) => {
        let timeRaw = typeof punch === 'string' ? punch : (punch.time_raw || punch.time || '');
        let kind = punch.kind;

        // Alterna entre IN e OUT se não definido explicitamente (Paridade: 0->IN, 1->OUT, 2->IN, 3->OUT...)
        if (!kind) {
          kind = (pIndex % 2 === 0) ? 'IN' : 'OUT';
        }

        const timeHhmm = normalizeTimeHHMM(timeRaw);

        punches.push({
          kind,
          time_raw: timeRaw,
          time_hhmm: timeHhmm
        });
      });

      days.push({
        date_raw: dateRaw,
        punches
      });
    });

    result.pages.push({
      page: pageNum,
      days
    });
  });

  return result;
}
