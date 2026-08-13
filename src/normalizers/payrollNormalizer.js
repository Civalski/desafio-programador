import { formatMoneyString, auditGlobalPayroll } from '../utils/validationUtils.js';
import { normalizeLabelKey, findSimilarLabel } from '../utils/labelNormalizer.js';

// Expressões regulares para identificar se uma linha pertence à seção de bases/totais (ex: Base INSS, Total Vencimentos, Valor Líquido)
const BASE_LABEL_REGEX = /^(base\s+inss|base\s+ir|base\s+irrf|base\s+fgts|fgts\s+do\s+m[eê]s|base\s+calc|total\s+venc|total\s+desc|valor\s+l[ií]quido|inss\s+patronal|total\s+prov)/i;

/**
 * Unifica páginas de holerite que possuem a mesma competência (mês/ano).
 * Consolida verbas (fields) e bases de cálculo que se completam em uma única entrada por mês.
 * 
 * @param {Array<Object>} pages Lista de páginas normalizadas
 * @returns {Array<Object>} Lista de páginas unificadas por competência
 */
export function unifyPayrollPages(pages = []) {
  const grouped = new Map();
  const resultPages = [];

  pages.forEach((p) => {
    const month = String(p.month || '').trim();
    const year = String(p.year || '').trim();
    
    // Se não tiver mês ou ano identificados, mantém a página separada
    if (!month || !year) {
      resultPages.push({ ...p });
      return;
    }

    const key = `${month.padStart(2, '0')}/${year}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        page: p.page,
        year,
        month: month.padStart(2, '0'),
        fields: p.fields ? [...p.fields.map(f => ({ ...f }))] : [],
        bases: p.bases ? [...p.bases.map(b => ({ ...b }))] : [],
        originalPages: [p.page],
        company: p.company || null,
        employee: p.employee || null,
        bankInfo: p.bankInfo || null,
        paymentDate: p.paymentDate || null,
        extraction: p.extraction || null
      });
    } else {
      const existing = grouped.get(key);
      existing.originalPages.push(p.page);

      const isZeroVal = (v) => !v || v === '0,00' || v === '0' || v === '0.00' || v === '0,0';

      // Merge de Fields com deduplicação por similaridade de label
      (p.fields || []).forEach((newField) => {
        const nCode = String(newField.code || '').trim();
        const nLabel = String(newField.label || '').trim();
        const nLabelKey = normalizeLabelKey(nLabel);

        const match = existing.fields.find((f) => {
          const eCode = String(f.code || '').trim();
          const eLabel = String(f.label || '').trim();
          // Prioridade 1: match por código numérico
          if (nCode && eCode && nCode === eCode) return true;
          // Prioridade 2: match por chave canônica normalizada (resolve variações de escrita)
          if (nLabelKey && normalizeLabelKey(eLabel) === nLabelKey) return true;
          return false;
        });

        const sameValue = match && String(match.value || '') === String(newField.value || '');
        const sameReference = match && String(match.reference || '') === String(newField.reference || '');
        const complementary = match && (isZeroVal(match.value) || isZeroVal(newField.value)) && (isZeroVal(match.reference) || isZeroVal(newField.reference) || sameReference);
        if (match && ((sameValue && sameReference) || complementary)) {
          // Atualiza campos ausentes/zerados com dados da nova página
          if (isZeroVal(match.value) && newField.value && !isZeroVal(newField.value)) {
            match.value = newField.value;
          }
          if (isZeroVal(match.reference) && newField.reference && !isZeroVal(newField.reference)) {
            match.reference = newField.reference;
          }
          if (!match.code && newField.code) match.code = newField.code;
          // Prefere o label mais completo (mais longo)
          if (match.label.length < nLabel.length) match.label = nLabel;
          // Propaga 'type' se ainda não está definido
          if (!match.type && newField.type) match.type = newField.type;
        } else {
          const occurrence = existing.fields.filter(f => {
            const fCode = String(f.code || '').trim();
            return (nCode && fCode === nCode) || (!nCode && normalizeLabelKey(f.label || '') === nLabelKey);
          }).length + 1;
          existing.fields.push({ ...newField, occurrence });
        }
      });

      // Merge de Bases com deduplicação por chave canônica
      (p.bases || []).forEach((newBase) => {
        const nLabel = String(newBase.label || '').trim();
        const nLabelKey = normalizeLabelKey(nLabel);
        const matchBase = existing.bases.find(b => normalizeLabelKey(String(b.label || '').trim()) === nLabelKey);

        if (matchBase && String(matchBase.value || '') === String(newBase.value || '')) {
          if (isZeroVal(matchBase.value) && newBase.value && !isZeroVal(newBase.value)) {
            matchBase.value = newBase.value;
          }
        } else {
          const occurrence = existing.bases.filter(b => normalizeLabelKey(String(b.label || '')) === nLabelKey).length + 1;
          existing.bases.push({ ...newBase, occurrence });
        }
      });

      existing.company ||= p.company || null;
      existing.employee ||= p.employee || null;
      existing.bankInfo ||= p.bankInfo || null;
      existing.paymentDate ||= p.paymentDate || null;
    }
  });

  // Adiciona as competências agrupadas mantendo a ordem de aparição
  grouped.forEach((groupedPage) => {
    resultPages.push(groupedPage);
  });

  return resultPages;
}

/**
 * Normaliza os dados brutos obtidos pelas APIs de IA ou extração tabular para o DTO de Holerite.
 * 
 * @param {Object} rawData Resposta bruta da API ou extração tabular
 * @param {Object} options Opções de normalização (ex: unifyCompetencies)
 * @returns {Object} DTO formatado estritamente no contrato do sistema
 */
export function normalizePayrollResponse(rawData, options = {}) {
  const result = {
    pages: [],
    audit: null
  };

  if (!rawData) {
    result.audit = auditGlobalPayroll(result);
    return result;
  }

  const inputPages = Array.isArray(rawData.pages) ? rawData.pages : [rawData];

  inputPages.forEach((pageData, pageIndex) => {
    const pageNum = pageData.pageNumber || pageData.page || (pageIndex + 1);
    
    // Normalização de competência
    let year = String(pageData.year || '').trim();
    let month = String(pageData.month || '').trim();

    if (month.toUpperCase() === 'MM' || month === '00') month = '';
    if (year.toUpperCase() === 'YYYY' || year === '0000') year = '';

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
      const isBaseItem = item.isBase || BASE_LABEL_REGEX.test(normalizeLabelKey(label));

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
          value: finalValue,
          type: item.type || 'provento',
          sourcePage: item.sourcePage ?? pageNum,
          sourceRegion: item.sourceRegion ?? pageData.sourceRegion ?? pageData.blockIndex ?? null,
          occurrence: item.occurrence ?? 1,
          confidence: item.confidence ?? null,
          evidenceType: item.evidenceType || 'ai'
        });
      }
    });

    // Incorpora bases pré-separadas vindas diretamente do OpenAI (pageData.bases)
    // A resposta da OpenAI já separa verbas, bases e totais.
    if (Array.isArray(pageData.bases)) {
      pageData.bases.forEach((b) => {
        const label = (b.label || '').trim();
        const value = formatMoneyString(b.value || '');
        if (!label) return;
        // Evita duplicar bases que já foram extraídas via regex dos items
        const alreadyExists = bases.some(existing => existing.label.toLowerCase() === label.toLowerCase());
        if (!alreadyExists) {
          bases.push({
            ...b,
            label,
            value,
            sourcePage: b.sourcePage ?? pageNum,
            sourceRegion: b.sourceRegion ?? pageData.sourceRegion ?? pageData.blockIndex ?? null,
            occurrence: b.occurrence ?? 1,
            confidence: b.confidence ?? null,
            evidenceType: b.evidenceType || 'ai'
          });
        }
      });
    }

    // Incorpora totals como bases (Total Proventos, Descontos, Líquido) se vierem do OpenAI
    if (pageData.totals) {
      const totalsMap = [
        { label: 'Total Proventos', value: pageData.totals.totalAdditions },
        { label: 'Total Descontos', value: pageData.totals.totalDeductions },
        { label: 'Valor Líquido', value: pageData.totals.netValue }
      ];
      totalsMap.forEach(({ label, value }) => {
        if (!value || !label) return;
        const formattedValue = formatMoneyString(value);
        const alreadyExists = bases.some(b => b.label.toLowerCase() === label.toLowerCase());
        if (!alreadyExists) {
          bases.push({ label, value: formattedValue });
        }
      });
    }

    result.pages.push({
      page: pageNum,
      year,
      month,
      fields,
      bases,
      paymentDate: pageData.paymentDate || null,
      company: pageData.company || null,
      employee: pageData.employee || null,
      bankInfo: pageData.bankInfo || null,
      sourceRegion: pageData.sourceRegion ?? pageData.blockIndex ?? null,
      extraction: pageData.extraction || pageData.extractionValidation || null
    });

  });

  // Unifica competências duplicadas se habilitado (padrão: true)
  if (options.unifyCompetencies !== false) {
    result.pages = unifyPayrollPages(result.pages);
  }

  // Anexa a auditoria global sobre as competências extraídas
  result.audit = auditGlobalPayroll(result);
  const extractionPages = result.pages.filter(page => page.extraction);
  if (extractionPages.length) {
    const extractionWarnings = extractionPages.flatMap(page => page.extraction.warnings || []);
    result.audit = {
      ...(result.audit || {}),
      status: extractionWarnings.length ? 'review_required' : (result.audit?.status || 'ok'),
      warnings: [...(result.audit?.warnings || []), ...extractionWarnings],
      extractionMetrics: {
        units: extractionPages.length,
        plannedPrompts: extractionPages.reduce((sum, page) => sum + Number(page.extraction.plannedPrompts || 0), 0),
        executedPrompts: extractionPages.reduce((sum, page) => sum + Number(page.extraction.executedPrompts || 0), 0),
        expectedItems: extractionPages.reduce((sum, page) => sum + Number(page.extraction.expectedCount || 0), 0),
        extractedItems: extractionPages.reduce((sum, page) => sum + Number(page.extraction.extractedCount || 0), 0),
        strategies: [...new Set(extractionPages.map(page => page.extraction.strategy).filter(Boolean))]
      }
    };
  }

  return result;
}

