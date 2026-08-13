import { normalizeLabelKey } from './labelNormalizer.js';

const MONEY = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+[.,]\d{2}/g;
const CODE_LABEL = /(?:^|\||\s{2,})\s*[-–]?\s*(\d{1,4})\s+([A-Za-zÀ-ÿ][^|\n]{1,60})/g;
const SUMMARY_HINT = /(?:base|total|líquido|liquido|fgts|inss|irrf|irf|remunera|sal[aá]rio\s+líquido|dias?\s*\/\s*horas?)/i;

function cleanLabel(value) {
  return String(value || '')
    .replace(MONEY, '')
    .replace(/^\s*[:|\-]+|\s*[:|\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalSummaryLabel(line) {
  const compact = String(line).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/remuneracao(?:do)?mes/.test(compact)) return 'Remuneração do Mês';
  if (/diashorastrab/.test(compact)) return 'Dias/Horas Trabalhados';
  if (/basedecalculo.*inss|baseinss/.test(compact)) return 'Base INSS';
  if (/basedecalculo.*(?:irrf|irf)|baseirrf/.test(compact)) return 'Base IRRF';
  if (/basedecalculo.*fgts|basefgts/.test(compact)) return 'Base FGTS';
  if (/valordo?fgts|fgtsdo?mes/.test(compact)) return 'FGTS do Mês';
  if (/tot(?:al)?rendimentos|totalproventos|totalvencimentos/.test(compact)) return 'Total Proventos';
  if (/totaldescontos/.test(compact)) return 'Total Descontos';
  if (/salarioliquido|valorliquido/.test(compact)) return 'Valor Líquido';
  return cleanLabel(line.split('|').find(part => SUMMARY_HINT.test(part)) || line);
}

export function buildPayrollInventory(text = '', metadata = {}) {
  const codes = [];
  const labels = [];
  const expectedSummaryLabels = [];
  const seenCodes = new Set();
  const seenLabels = new Set();

  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let hasCodeLabel = false;
    for (const match of line.matchAll(CODE_LABEL)) {
      hasCodeLabel = true;
      const code = match[1].trim();
      const label = cleanLabel(match[2].split(/\s{2,}|\|/)[0]);
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        codes.push({ code, label });
      }
    }
    MONEY.lastIndex = 0;
    if (!hasCodeLabel && SUMMARY_HINT.test(line) && MONEY.test(line)) {
      MONEY.lastIndex = 0;
      const label = canonicalSummaryLabel(line);
      const key = normalizeLabelKey(label);
      if (label && key && !seenLabels.has(key)) {
        seenLabels.add(key);
        expectedSummaryLabels.push(label);
      }
    }
    MONEY.lastIndex = 0;
  }

  return {
    sourcePage: metadata.sourcePage ?? metadata.page ?? null,
    sourceRegion: metadata.sourceRegion ?? metadata.region ?? null,
    evidenceType: metadata.evidenceType || 'text',
    expectedCodes: codes,
    expectedSummaryLabels,
    textLength: String(text).length
  };
}

export function planPayrollPromptBatches(inventory = {}, options = {}) {
  const maxCodesPerPrompt = Math.max(1, Number(options.maxCodesPerPrompt || 6));
  const codes = inventory.expectedCodes || [];
  const fieldBatches = [];
  for (let index = 0; index < codes.length; index += maxCodesPerPrompt) {
    fieldBatches.push(codes.slice(index, index + maxCodesPerPrompt));
  }
  return {
    maxCodesPerPrompt,
    fieldBatches,
    summaryPasses: 1,
    plannedPrompts: 1 + fieldBatches.length
  };
}

const present = value => value !== null && value !== undefined && String(value).trim() !== '';

export function auditPayrollCoverage(inventory = {}, extraction = {}) {
  const fields = Array.isArray(extraction.fields) ? extraction.fields : [];
  const bases = Array.isArray(extraction.bases) ? extraction.bases : [];
  const extractedCodes = new Set(fields.map(field => String(field.code || '').trim()).filter(Boolean));
  const extractedLabels = new Set([...fields, ...bases].map(item => normalizeLabelKey(item.label || '')).filter(Boolean));
  const missingCodes = (inventory.expectedCodes || []).filter(item => !extractedCodes.has(item.code));
  const missingSummaryLabels = (inventory.expectedSummaryLabels || []).filter(label => {
    const key = normalizeLabelKey(label);
    return ![...extractedLabels].some(extracted => extracted === key || extracted.includes(key) || key.includes(extracted));
  });
  const totals = extraction.totals || {};
  const visibleCount = (inventory.expectedCodes || []).length + (inventory.expectedSummaryLabels || []).length;
  const missingCount = missingCodes.length + missingSummaryLabels.length;
  const coverage = visibleCount ? Math.max(0, (visibleCount - missingCount) / visibleCount) : (fields.length || bases.length ? 1 : 0);
  const warnings = [];
  if (missingCodes.length) warnings.push(`Códigos visíveis ausentes: ${missingCodes.map(item => item.code).join(', ')}`);
  if (missingSummaryLabels.length) warnings.push(`Campos de resumo visíveis ausentes: ${missingSummaryLabels.join(', ')}`);
  if (!fields.length && inventory.textLength > 100) warnings.push('Nenhuma verba foi extraída de uma região textual não vazia.');
  return {
    valid: missingCount === 0 && (fields.length > 0 || bases.length > 0 || Object.values(totals).some(present)),
    coverage,
    expectedCount: visibleCount,
    extractedCount: Math.max(0, visibleCount - missingCount),
    missingCodes,
    missingSummaryLabels,
    warnings
  };
}

function identity(item) {
  const code = String(item.code || '').trim();
  return code ? `code:${code}` : `label:${normalizeLabelKey(item.label || '')}`;
}

function valueIdentity(item) {
  return `${identity(item)}|${String(item.reference || '').trim()}|${String(item.value || '').trim()}|${item.type || ''}`;
}

export function addEvidenceMetadata(items = [], metadata = {}) {
  return items.map((item, index) => ({
    ...item,
    sourcePage: item.sourcePage ?? metadata.sourcePage ?? null,
    sourceRegion: item.sourceRegion ?? metadata.sourceRegion ?? null,
    occurrence: item.occurrence ?? index + 1,
    confidence: item.confidence ?? metadata.confidence ?? null,
    evidenceType: item.evidenceType || metadata.evidenceType || 'ai'
  }));
}

export function reconcilePayrollExtractions(primary = {}, secondary = {}, metadata = {}) {
  const reconcileItems = (first, second) => {
    const output = [];
    const exact = new Set();
    for (const item of [...(first || []), ...(second || [])]) {
      if (!item || (!item.label && !item.code && !item.value)) continue;
      const exactKey = valueIdentity(item);
      if (exact.has(exactKey)) continue;
      exact.add(exactKey);
      const same = output.find(existing => identity(existing) === identity(item));
      if (same && (!same.value || same.value === '0,00') && item.value) Object.assign(same, item);
      else output.push({ ...item });
    }
    return addEvidenceMetadata(output, metadata).map((item, index, all) => ({
      ...item,
      occurrence: all.filter(candidate => identity(candidate) === identity(item)).indexOf(item) + 1 || index + 1
    }));
  };

  return {
    ...secondary,
    ...primary,
    fields: reconcileItems(primary.fields, secondary.fields),
    bases: reconcileItems(primary.bases, secondary.bases),
    totals: { ...(secondary.totals || {}), ...(primary.totals || {}) }
  };
}
