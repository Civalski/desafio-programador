import { formatMoneyString, auditGlobalPayroll } from '../utils/validationUtils.js';
import { normalizeLabelKey, findSimilarLabel } from '../utils/labelNormalizer.js';
import { canonicalizePayrollItem } from '../utils/payrollCanonical.js';
import { normalizeExtractionMetrics } from '../utils/adaptivePromptPlanner.js';

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

    const payrollType = p.payrollType || 'normal';
    const blockIdentity = p.blockIndex !== null && p.blockIndex !== undefined
      ? (p.recordKey || `${p.page}:${p.blockIndex}`)
      : '';
    const key = `${month.padStart(2, '0')}/${year}|${payrollType}|${blockIdentity}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        page: p.page,
        blockIndex: p.blockIndex ?? null,
        recordKey: p.recordKey || null,
        sourcePages: p.sourcePages || [p.page],
        payrollType,
        year,
        month: month.padStart(2, '0'),
        fields: p.fields ? [...p.fields.map(f => ({ ...f }))] : [],
        bases: p.bases ? [...p.bases.map(b => ({ ...b }))] : [],
        originalPages: [p.page],
        company: p.company || null,
        employee: p.employee || null,
        bankInfo: p.bankInfo || null,
        paymentDate: p.paymentDate || null,
        extraction: p.extraction || null,
        reviewRequired: Boolean(p.reviewRequired)
      });
    } else {
      const existing = grouped.get(key);
      existing.originalPages.push(p.page);
      existing.sourcePages = [...new Set([...(existing.sourcePages || []), ...(p.sourcePages || [p.page])])];

      const isZeroVal = (v) => !v || v === '0,00' || v === '0' || v === '0.00' || v === '0,0';

      // Merge de Fields com deduplicação por similaridade de label
      (p.fields || []).forEach((newField) => {
        const nCode = String(newField.code || '').trim();
        const nLabel = String(newField.label || '').trim();
        const nLabelKey = newField.canonicalKey || normalizeLabelKey(nLabel);

        const match = existing.fields.find((f) => {
          const eCode = String(f.code || '').trim();
          const eLabel = String(f.label || '').trim();
          // Prioridade 1: match por código numérico
          if (newField.canonicalKey && f.canonicalKey === newField.canonicalKey) return true;
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
          if (match) {
            match.conflict = true;
            match.reviewRequired = true;
            existing.reviewRequired = true;
          }
          existing.fields.push({ ...newField, occurrence, conflict: Boolean(match || newField.conflict), reviewRequired: Boolean(match || newField.reviewRequired) });
        }
      });

      // Merge de Bases com deduplicação por chave canônica
      (p.bases || []).forEach((newBase) => {
        const nLabel = String(newBase.label || '').trim();
        const nLabelKey = newBase.canonicalKey || normalizeLabelKey(nLabel);
        const matchBase = existing.bases.find(b => (newBase.canonicalKey && b.canonicalKey === newBase.canonicalKey) || normalizeLabelKey(String(b.label || '').trim()) === nLabelKey);

        if (matchBase && String(matchBase.value || '') === String(newBase.value || '')) {
          if (isZeroVal(matchBase.value) && newBase.value && !isZeroVal(newBase.value)) {
            matchBase.value = newBase.value;
          }
        } else {
          const occurrence = existing.bases.filter(b => normalizeLabelKey(String(b.label || '')) === nLabelKey).length + 1;
          if (matchBase) {
            matchBase.conflict = true;
            matchBase.reviewRequired = true;
            existing.reviewRequired = true;
          }
          existing.bases.push({ ...newBase, occurrence, conflict: Boolean(matchBase || newBase.conflict), reviewRequired: Boolean(matchBase || newBase.reviewRequired) });
        }
      });

      existing.company ||= p.company || null;
      existing.employee ||= p.employee || null;
      existing.bankInfo ||= p.bankInfo || null;
      existing.paymentDate ||= p.paymentDate || null;
      existing.reviewRequired ||= Boolean(p.reviewRequired);
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
        bases.push(canonicalizePayrollItem({
          label,
          value: value || formatMoneyString(item.reference || ''),
          sourcePage: item.sourcePage ?? pageNum,
          sourceRegion: item.sourceRegion ?? pageData.sourceRegion ?? pageData.blockIndex ?? null,
          occurrence: item.occurrence ?? 1,
          confidence: item.confidence ?? null,
          evidenceType: item.evidenceType || 'ai',
          conflict: item.conflict,
          reviewRequired: item.reviewRequired
        }, 'base'));
      } else {
        let reference = String(item.reference || item.ref || '').trim();
        let finalValue = value;

        // Se o valor estiver vazio mas a referência contiver o valor monetário
        if (!finalValue && reference) {
          finalValue = formatMoneyString(reference);
          reference = '';
        }

        fields.push(canonicalizePayrollItem({
          code: String(item.code || '').trim(),
          label,
          reference,
          value: finalValue,
          type: item.type || 'provento',
          sourcePage: item.sourcePage ?? pageNum,
          sourceRegion: item.sourceRegion ?? pageData.sourceRegion ?? pageData.blockIndex ?? null,
          occurrence: item.occurrence ?? 1,
          confidence: item.confidence ?? null,
          evidenceType: item.evidenceType || 'ai',
          conflict: item.conflict,
          reviewRequired: item.reviewRequired
        }, 'field'));
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
        const canonicalBase = canonicalizePayrollItem({
          ...b,
          label,
          value,
          sourcePage: b.sourcePage ?? pageNum,
          sourceRegion: b.sourceRegion ?? pageData.sourceRegion ?? pageData.blockIndex ?? null,
          occurrence: b.occurrence ?? 1,
          confidence: b.confidence ?? null,
          evidenceType: b.evidenceType || 'ai'
        }, 'base');
        const alreadyExists = bases.some(existing => canonicalBase.canonicalKey && existing.canonicalKey === canonicalBase.canonicalKey && String(existing.value || '') === String(canonicalBase.value || ''));
        if (!alreadyExists) {
          bases.push(canonicalBase);
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
        const canonicalBase = canonicalizePayrollItem({
          label,
          value: formattedValue,
          sourcePage: pageNum,
          sourceRegion: pageData.sourceRegion ?? pageData.blockIndex ?? null,
          confidence: 1,
          evidenceType: 'derived_total'
        }, 'base');
        const alreadyExists = bases.some(b => b.canonicalKey === canonicalBase.canonicalKey);
        if (!alreadyExists) {
          bases.push(canonicalBase);
        }
      });
    }

    const payrollType = inferPayrollType(pageData, fields);
    const reviewRequired = Boolean(
      pageData.reviewRequired ||
      fields.some(item => item.reviewRequired || item.conflict) ||
      bases.some(item => item.reviewRequired || item.conflict || !item.canonicalKey)
    );

    result.pages.push({
      page: pageNum,
      blockIndex: pageData.blockIndex ?? null,
      recordKey: pageData.recordKey || pageData.resultKey || null,
      sourcePages: pageData.sourcePages || [pageNum],
      payrollType,
      year,
      month,
      fields,
      bases,
      paymentDate: pageData.paymentDate || null,
      company: pageData.company || null,
      employee: pageData.employee || null,
      bankInfo: pageData.bankInfo || null,
      sourceRegion: pageData.sourceRegion ?? pageData.blockIndex ?? null,
      extraction: pageData.extraction || pageData.extractionValidation || null,
      reviewRequired
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
    const normalizedMetrics = extractionPages.map(page => normalizeExtractionMetrics(page.extraction, {
      deterministicItems: (page.fields?.length || 0) + (page.bases?.length || 0) + Object.values(page.totals || {}).filter(Boolean).length
    }));
    const visibleItems = normalizedMetrics.reduce((sum, metrics) => sum + metrics.visibleItems, 0);
    const deterministicItems = normalizedMetrics.reduce((sum, metrics) => sum + metrics.deterministicItems, 0);
    const aiRecoveredItems = normalizedMetrics.reduce((sum, metrics) => sum + metrics.aiRecoveredItems, 0);
    const pendingItems = normalizedMetrics.reduce((sum, metrics) => sum + metrics.pendingItems, 0);
    result.audit = {
      ...(result.audit || {}),
      status: extractionWarnings.length ? 'review_required' : (result.audit?.status || 'ok'),
      warnings: [...(result.audit?.warnings || []), ...extractionWarnings],
      extractionMetrics: {
        units: extractionPages.length,
        visibleItems, deterministicItems, aiRecoveredItems, pendingItems,
        coverage: visibleItems ? (visibleItems - pendingItems) / visibleItems : 1,
        plannedBatches: normalizedMetrics.reduce((sum, metrics) => sum + metrics.plannedBatches, 0),
        plannedPrompts: normalizedMetrics.reduce((sum, metrics) => sum + metrics.plannedBatches, 0),
        executedPrompts: normalizedMetrics.reduce((sum, metrics) => sum + metrics.executedPrompts, 0),
        expectedItems: visibleItems,
        extractedItems: Math.max(0, visibleItems - pendingItems),
        strategies: [...new Set(extractionPages.map(page => page.extraction.strategy).filter(Boolean))]
      }
    };
  }

  const canonicalWarnings = result.pages.filter(page => page.reviewRequired).map(page => {
    const competency = page.month && page.year ? `${page.month}/${page.year}` : `pÃ¡gina ${page.page}`;
    return `${competency} (${page.payrollType}): itens ambÃ­guos ou conflitantes exigem revisÃ£o.`;
  });
  if (canonicalWarnings.length) {
    result.audit = {
      ...(result.audit || {}),
      status: 'review_required',
      warnings: [...new Set([...(result.audit?.warnings || []), ...canonicalWarnings])]
    };
  }

  return result;
}

function inferPayrollType(pageData = {}, fields = []) {
  if (pageData.payrollType) return pageData.payrollType;
  const labels = fields.map(field => `${field.code || ''} ${field.label || ''}`).join(' ');
  const historicalCount = fields.filter(field => /^(371|374)$/.test(String(field.code || ''))).length;
  if (historicalCount >= 3) return 'historico_13';
  if (/\b311\s+Part\s+Lucr|\b313\s+IRF\s+Part/i.test(labels) && fields.every(field => /^(311|313)$/.test(String(field.code || '')))) return 'plr';
  if (/13[ÂºoÂ°]|13o\.\s*Sal/i.test(labels)) return 'decimo_terceiro';
  return 'normal';
}

