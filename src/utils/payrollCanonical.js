import { normalizeLabelKey } from './labelNormalizer.js';

const SUMMARY_DEFINITIONS = Object.freeze([
  { id: 'base_inss', label: 'Base INSS', pattern: /base(?:decalculo)?(?:do)?inss/ },
  { id: 'base_irrf_13', label: 'Base IRRF 13º', pattern: /base(?:decalculo)?(?:do)?(?:irrf|irf)13/ },
  { id: 'base_irrf', label: 'Base IRRF', pattern: /base(?:decalculo)?(?:do)?(?:irrf|irf)/ },
  { id: 'base_fgts', label: 'Base FGTS', pattern: /base(?:decalculo)?(?:do)?fgts/ },
  { id: 'fgts_mes', label: 'FGTS do Mês', pattern: /(?:valordo)?fgts(?:do)?mes/ },
  { id: 'irrf_recolher', label: 'IRRF a Recolher', pattern: /(?:valordo)?(?:irrf|irf)arecolher/ },
  { id: 'remuneracao_mes', label: 'Remuneração do Mês', pattern: /remuneracao(?:do)?mes/ },
  { id: 'dias_horas', label: 'Dias/Horas Trabalhados', pattern: /diashorastrab/ },
  { id: 'total_proventos', label: 'Total Proventos', pattern: /tot(?:al)?rendimentos|totalproventos|totalvencimentos/ },
  { id: 'total_descontos', label: 'Total Descontos', pattern: /totaldescontos/ },
  { id: 'valor_liquido', label: 'Valor Líquido', pattern: /salarioliquido|valorliquido|liquidoareceber/ }
]);

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizedCode(value) {
  const code = String(value || '').trim();
  if (!code) return '';
  return /^\d+$/.test(code) ? String(Number(code)) : normalizeLabelKey(code);
}

export function canonicalSummary(label = '') {
  const key = compact(label);
  if (!key) return null;
  const matches = SUMMARY_DEFINITIONS.filter(definition => definition.pattern.test(key));
  return matches[0] || null;
}

export function canonicalizePayrollItem(item = {}, kind = 'field') {
  const originalLabel = String(item.originalLabel || item.label || item.description || '').trim();
  const sourceLooksAmbiguous = /\|/.test(originalLabel);

  if (kind === 'base') {
    const summary = canonicalSummary(originalLabel);
    if (sourceLooksAmbiguous || (!summary && originalLabel.length > 80)) {
      return { ...item, originalLabel, canonicalKey: null, reviewRequired: true };
    }
    const fallback = normalizeLabelKey(originalLabel);
    return {
      ...item,
      originalLabel,
      label: summary?.label || originalLabel,
      canonicalKey: summary ? `base:${summary.id}` : (fallback ? `base:label:${fallback}` : null),
      reviewRequired: Boolean(item.reviewRequired || item.conflict || (!summary && !fallback))
    };
  }

  const code = normalizedCode(item.code);
  const labelKey = normalizeLabelKey(originalLabel);
  const canonicalKey = code ? `field:code:${code}` : (labelKey ? `field:label:${labelKey}` : null);
  return {
    ...item,
    originalLabel,
    label: originalLabel,
    canonicalKey,
    reviewRequired: Boolean(item.reviewRequired || item.conflict || !canonicalKey || sourceLooksAmbiguous)
  };
}

function preferredLabel(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.length > current.length ? candidate : current;
}

export function buildCanonicalColumnRegistry(pages = []) {
  const fields = new Map();
  const bases = new Map();
  for (const page of pages) {
    for (const raw of page.fields || []) {
      const item = raw.canonicalKey ? raw : canonicalizePayrollItem(raw, 'field');
      if (!item.canonicalKey) continue;
      const existing = fields.get(item.canonicalKey);
      fields.set(item.canonicalKey, {
        key: item.canonicalKey,
        label: preferredLabel(existing?.label, item.label || item.originalLabel),
        code: existing?.code || String(item.code || '').trim(),
        kind: 'field'
      });
    }
    for (const raw of page.bases || []) {
      const item = raw.canonicalKey !== undefined ? raw : canonicalizePayrollItem(raw, 'base');
      if (!item.canonicalKey) continue;
      const existing = bases.get(item.canonicalKey);
      bases.set(item.canonicalKey, {
        key: item.canonicalKey,
        label: preferredLabel(existing?.label, item.label || item.originalLabel),
        kind: 'base'
      });
    }
  }
  return { fields: [...fields.values()], bases: [...bases.values()] };
}

export function itemsByCanonicalKey(items = [], kind = 'field') {
  const grouped = new Map();
  for (const raw of items) {
    const item = raw.canonicalKey !== undefined ? raw : canonicalizePayrollItem(raw, kind);
    if (!item.canonicalKey) continue;
    if (!grouped.has(item.canonicalKey)) grouped.set(item.canonicalKey, []);
    grouped.get(item.canonicalKey).push(item);
  }
  return grouped;
}

export function selectCanonicalItem(items = [], canonicalKey, kind = 'field') {
  const candidates = itemsByCanonicalKey(items, kind).get(canonicalKey) || [];
  if (!candidates.length) return null;
  const ordered = [...candidates].sort((a, b) => {
    if (Boolean(a.reviewRequired || a.conflict) !== Boolean(b.reviewRequired || b.conflict)) return a.reviewRequired || a.conflict ? 1 : -1;
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
  const values = new Set(candidates.map(item => String(item.value || '')).filter(Boolean));
  return values.size > 1 ? { ...ordered[0], conflict: true, reviewRequired: true } : ordered[0];
}

export function payrollTypeLabel(value = '') {
  return ({ normal: 'Folha normal', plr: 'PLR', decimo_terceiro: '13º salário', historico_13: 'Histórico de 13º', suplementar: 'Folha suplementar' })[value] || 'Folha normal';
}
