import ExcelJS from 'exceljs';
import { isNonSequentialCompetency } from './validationUtils.js';
import { normalizeLabelKey } from './labelNormalizer.js';

const HEADER = '173772';
const WARNING = 'FFF3CD';
const DANGER = 'F8D7DA';
const DANGER_BORDER = 'DC3545';
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function payrollRows(pages) {
  const columns = new Map();
  const itemKey = (kind, item, property = 'value') => `${kind}:${normalizeLabelKey(item.label || item.description || '')}:${Number(item.occurrence || 1)}:${property}`;
  const displayLabel = (item, suffix = '') => {
    const label = String(item.label || item.description || '').trim();
    const occurrence = Number(item.occurrence || 1);
    const origin = occurrence > 1 ? ` — ocorrência ${occurrence}${item.sourcePage ? `/pág. ${item.sourcePage}` : ''}` : '';
    return `${label}${suffix}${origin}`;
  };
  pages.forEach(page => {
    (page.fields || []).forEach(field => {
      if (!field.label) return;
      columns.set(itemKey('field', field), displayLabel(field));
      columns.set(itemKey('field', field, 'reference'), displayLabel(field, ' — Referência'));
    });
    (page.bases || []).forEach(base => {
      if (base.label) columns.set(itemKey('base', base), displayLabel(base));
    });
  });
  const headers = [
    'Pág.', 'Mês', 'Ano', 'Empresa', 'CNPJ', 'Funcionário', 'CPF', 'Matrícula',
    'Cargo', 'Departamento', 'Admissão', 'Banco', 'Agência', 'Conta', ...columns.values()
  ];
  let priorReadable = null;
  const rows = pages.map((page, index) => {
    const readable = /^(0[1-9]|1[0-2])$/.test(String(page.month || '')) && /^\d{4}$/.test(String(page.year || ''));
    const danger = readable && priorReadable && isNonSequentialCompetency(priorReadable, page);
    if (readable) priorReadable = page;
    const valuesByColumn = new Map();
    (page.fields || []).forEach(field => {
      valuesByColumn.set(itemKey('field', field), field.value || '');
      valuesByColumn.set(itemKey('field', field, 'reference'), field.reference || '');
    });
    (page.bases || []).forEach(base => valuesByColumn.set(itemKey('base', base), base.value || ''));
    const values = [
      page.page || index + 1, page.month || '', page.year || '',
      page.company?.name || '', page.company?.cnpj || '',
      page.employee?.name || '', page.employee?.cpf || '', page.employee?.registration || '',
      page.employee?.role || '', page.employee?.department || '', page.employee?.admissionDate || '',
      page.bankInfo?.bank || '', page.bankInfo?.agency || '', page.bankInfo?.account || '',
      ...Array.from(columns.keys()).map(key => valuesByColumn.get(key) || '')
    ];
    const empty = !(page.fields || []).length && !(page.bases || []).length && !page.month && !page.year;
    const incomplete = page.extraction && page.extraction.valid === false;
    return { values, warning: !danger && (empty || incomplete || values.some(v => String(v).includes('?'))), danger };
  });
  return { headers, rows };
}

function exportModel(job) { return payrollRows(job.value?.pages || []); }

export function exportToCsv(job) {
  if (!job?.value) return '';
  const { headers, rows } = exportModel(job);
  // CSV cannot encode cell styles; its literal data layout remains identical to XLSX.
  return [headers, ...rows.map(row => row.values)].map(row => row.map(csv).join(',')).join('\n');
}

export async function generateExport(job, format = 'xlsx') {
  const selected = String(format || 'xlsx').toLowerCase();
  const filename = `transcricao_${job.id}_${job.tipo}.${selected}`;
  if (selected === 'json') return { content: JSON.stringify(job, null, 2), contentType: 'application/json; charset=utf-8', filename };
  if (selected === 'csv') return { content: exportToCsv(job), contentType: 'text/csv; charset=utf-8', filename };
  if (selected !== 'xlsx') throw new Error('Formato de exportação inválido');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Holerite');
  const { headers, rows } = exportModel(job);
  worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(12, header.length + 3) }));
  rows.forEach(row => worksheet.addRow(row.values));
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(index + 2);
    if (row.warning || row.danger) {
      excelRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.danger ? DANGER : WARNING } }; });
      if (row.danger) excelRow.getCell(1).border = { left: { style: 'medium', color: { argb: DANGER_BORDER } } };
    }
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return { content: Buffer.from(buffer), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `transcricao_${job.id}_${job.tipo}.xlsx` };
}
