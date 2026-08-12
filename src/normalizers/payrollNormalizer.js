import { formatMoneyString } from '../utils/validationUtils.js';

// Expressões regulares para identificar se uma linha pertence à seção de bases/totais (ex: Base INSS, Total Vencimentos, Valor Líquido)
const BASE_LABEL_REGEX = /^(base\s+inss|base\s+ir|base\s+irrf|base\s+fgts|fgts\s+do\s+m[eê]s|base\s+calc|total\s+venc|total\s+desc|valor\s+l[ií]quido|inss\s+patronal|total\s+prov)/i;

/**
 * Normaliza os dados brutos obtidos pelo Mindee para o DTO de Holerite.
 * 
 * @param {Object} rawData Resposta bruta da API do Mindee ou extração tabular
 * @returns {Object} DTO formatado estritamente no contrato do sistema
 */
export function normalizePayrollResponse(rawData) {
  const result = {
    pages: []
  };

  if (!rawData) {
    return result;
  }

  const inputPages = Array.isArray(rawData.pages) ? rawData.pages : [rawData];

  inputPages.forEach((pageData, pageIndex) => {
    const pageNum = pageData.pageNumber || pageData.page || (pageIndex + 1);
    
    // Normalização de competência
    let year = String(pageData.year || '').trim();
    let month = String(pageData.month || '').trim();

    if (month && month.length === 1) {
      month = `0${month}`;
    }

    const fields = [];
    const bases = [];

    const items = pageData.items || pageData.lineItems || pageData.fields || [];

    items.forEach((item) => {
      const label = (item.label || item.description || '').trim();
      const value = formatMoneyString(item.value || item.amount || '');

      if (!label && !value) return;

      // Verifica se deve ir para bases[] ou fields[]
      const isBaseItem = item.isBase || BASE_LABEL_REGEX.test(label);

      if (isBaseItem) {
        bases.push({
          label,
          value: value || formatMoneyString(item.reference || '')
        });
      } else {
        let reference = String(item.reference || item.ref || '').trim();
        let finalValue = value;

        // Se o valor estiver vazio mas a referência contiver o valor monetário
        if (!finalValue && reference) {
          finalValue = formatMoneyString(reference);
          reference = '';
        }

        fields.push({
          code: String(item.code || '').trim(),
          label,
          reference,
          value: finalValue
        });
      }
    });

    result.pages.push({
      page: pageNum,
      year,
      month,
      fields,
      bases
    });
  });

  return result;
}
