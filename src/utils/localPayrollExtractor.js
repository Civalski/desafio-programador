import { classifyPayrollLabel } from './payrollCatalog.js';

const MONEY_SOURCE = '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|-?\\d+[,.]\\d{2}';
const MONEY = new RegExp(MONEY_SOURCE, 'g');
const SUMMARY = /(?:base|total|l[ií]quido|fgts|inss|irrf|remunera|tribut[aá]vel|isento)/i;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

export function extractPayrollLocal(text = '', metadata = {}) {
  const fields = [];
  const bases = [];
  const totals = {};
  const unresolvedLines = [];
  const sourcePage = metadata.sourcePage ?? null;
  const evidenceType = metadata.evidenceType || 'text';

  for (const [lineIndex, raw] of String(text).split('\n').entries()) {
    const rawSegments = raw.split(/\s+\|\s+/).map(clean).filter(Boolean);
    const hasCodedSegment = rawSegments.some(segment => /^[-–]?\s*\d{1,4}\s+[A-Za-zÀ-ÿ]/.test(segment));
    const segments = [];
    if (hasCodedSegment) {
      let current = '';
      for (const segment of rawSegments) {
        if (/^[-–]?\s*\d{1,4}\s+[A-Za-zÀ-ÿ]/.test(segment)) {
          if (current) segments.push(current);
          current = segment;
        } else if (current) current += ` ${segment}`;
      }
      if (current) segments.push(current);
    } else segments.push(clean(raw));
    for (const segment of segments) {
      const values = [...segment.matchAll(new RegExp(MONEY_SOURCE, 'g'))].map(match => match[0]);
      const codeMatch = segment.match(/^[-–]?\s*(\d{1,4})\s+(.+?)\s+(?=-?\d)/);
      if (codeMatch && values.length) {
        const label = clean(codeMatch[2]);
        const classification = classifyPayrollLabel(label);
        const monetaryValue = values.at(-1);
        const percentReference = segment.slice(0, segment.lastIndexOf(monetaryValue)).match(/\d+(?:[,.]\d+)?\s*%/g)?.at(-1) || '';
        const item = {
          code: codeMatch[1], label,
          reference: values.length > 1 ? values.at(-2) : percentReference, value: monetaryValue,
          type: /inss|irrf|desconto|falt|adiant|consign|pens[aã]o|plano|vale[- ]?(?:transporte|refei|alimenta)/i.test(label) ? 'desconto' : 'provento',
          sourcePage, sourceRegion: `line:${lineIndex + 1}`, confidence: 0.9,
          evidenceType, category: classification?.category || null
        };
        fields.push(item);
        continue;
      }
      if (values.length && SUMMARY.test(segment)) {
        const label = clean(segment.replace(MONEY, ''));
        const classification = classifyPayrollLabel(label);
        const value = values.at(-1);
        if (/total.*provent|total.*venc|total.*cr[eé]dit|total bruto/i.test(label)) totals.totalAdditions = value;
        else if (/total.*descont|total.*d[eé]bit/i.test(label)) totals.totalDeductions = value;
        else if (/l[ií]quido|a receber|creditado/i.test(label)) totals.netValue = value;
        else bases.push({ label, value, sourcePage, sourceRegion: `line:${lineIndex + 1}`, confidence: 0.92, evidenceType, category: classification?.category || null });
      } else if (values.length || /\d{1,4}\s+[A-Za-zÀ-ÿ]/.test(segment)) {
        unresolvedLines.push({ line: lineIndex + 1, text: segment });
      }
    }
  }
  return { fields, bases, totals, unresolvedLines };
}
