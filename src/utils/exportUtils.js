import ExcelJS from 'exceljs';
import { unifyPayrollPages } from '../normalizers/payrollNormalizer.js';
import { normalizeLabelKey } from './labelNormalizer.js';

/**
 * Utilitário de exportação de transcrições em diferentes formatos (JSON, CSV, XLSX).
 */

/**
 * Converte a estrutura de dados de uma transcrição para string CSV.
 * @param {Object} job 
 * @returns {string}
 */
export function exportToCsv(job) {
  if (!job || !job.value) return '';

  const tipo = job.tipo;
  const rawPages = job.value.pages || [];
  const pages = tipo === 'holerite' ? unifyPayrollPages(rawPages) : rawPages;
  const rows = [];

  if (tipo === 'cartao-ponto') {
    rows.push(['Página', 'Data Raw', 'Data Formatada', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Total Horas', 'Observações'].join(','));
    for (const page of pages) {
      const pageNum = page.page || 1;
      const days = page.days || [];
      for (const day of days) {
        const dateRaw = `"${day.date_raw || ''}"`;
        const dateFormatted = `"${day.date_formatted || ''}"`;
        const punches = day.punches || [];
        const in1 = punches[0] ? `"${punches[0].time_hhmm || punches[0].time_raw || ''}"` : '""';
        const out1 = punches[1] ? `"${punches[1].time_hhmm || punches[1].time_raw || ''}"` : '""';
        const in2 = punches[2] ? `"${punches[2].time_hhmm || punches[2].time_raw || ''}"` : '""';
        const out2 = punches[3] ? `"${punches[3].time_hhmm || punches[3].time_raw || ''}"` : '""';
        const total = `"${day.total_worked_hours || ''}"`;
        const obs = `"${(day.alerts || []).join('; ')}"`;
        rows.push([pageNum, dateRaw, dateFormatted, in1, out1, in2, out2, total, obs].join(','));
      }
    }
  } else if (tipo === 'holerite') {
    // Coleta todos os labels únicos de verbas e bases (deduplicados por chave canônica)
    const verbaKeyMap = new Map(); // chave canônica → label preferído
    const baseKeyMap = new Map();

    for (const page of pages) {
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (!label) continue;
        const key = normalizeLabelKey(label);
        if (!verbaKeyMap.has(key)) {
          verbaKeyMap.set(key, label);
        } else if (label.length > verbaKeyMap.get(key).length) {
          verbaKeyMap.set(key, label); // prefere o label mais completo
        }
      }
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (!label) continue;
        const key = normalizeLabelKey(label);
        if (!baseKeyMap.has(key)) {
          baseKeyMap.set(key, label);
        }
      }
    }

    const verbaKeys = Array.from(verbaKeyMap.values());
    const baseKeys = Array.from(baseKeyMap.values());
    const allKeys = [...verbaKeys, ...baseKeys];
    const headers = ['Página', 'Competência', ...allKeys];
    rows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

    for (const page of pages) {
      const pageNum = page.page || 1;
      const comp = (page.month && page.year) ? `${page.month}/${page.year}` : '';

      // Monta mapa por chave canônica para deduplicação
      const fieldMap = {};
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) fieldMap[normalizeLabelKey(label)] = item.value || '';
      }

      const baseMap = {};
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) baseMap[normalizeLabelKey(label)] = item.value || '';
      }

      const rowValues = [pageNum, `"${comp}"`];
      for (const key of Array.from(verbaKeyMap.keys())) {
        const val = fieldMap[key] || '';
        rowValues.push(`"${String(val).replace(/"/g, '""')}"`);
      }
      for (const key of Array.from(baseKeyMap.keys())) {
        const val = baseMap[key] || '';
        rowValues.push(`"${String(val).replace(/"/g, '""')}"`);
      }

      rows.push(rowValues.join(','));
    }
  }

  return rows.join('\n');
}

/**
 * Converte o job para o formato de exportação solicitado (xlsx, csv, json).
 * @param {Object} job 
 * @param {'xlsx' | 'csv' | 'json'} format 
 * @returns {Promise<{ content: string|Buffer, contentType: string, filename: string }>}
 */
export async function generateExport(job, format = 'xlsx') {
  const sanitizeFormat = (format || 'xlsx').toLowerCase();
  const filename = `transcricao_${job.id}_${job.tipo}.${sanitizeFormat}`;

  if (sanitizeFormat === 'json') {
    return {
      content: JSON.stringify(job, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename
    };
  }

  if (sanitizeFormat === 'csv') {
    return {
      content: exportToCsv(job),
      contentType: 'text/csv; charset=utf-8',
      filename
    };
  }

  // Gera planilha Excel (.xlsx) nativa via ExcelJS
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Quick Filler Scanner';
  workbook.created = new Date();

  const sheetName = job.tipo === 'cartao-ponto' ? 'Cartão de Ponto' : 'Holerite';
  const worksheet = workbook.addWorksheet(sheetName);

  const rawPages = job.value?.pages || [];
  const pages = job.tipo === 'holerite' ? unifyPayrollPages(rawPages) : rawPages;

  if (job.tipo === 'cartao-ponto') {
    worksheet.columns = [
      { header: 'Página', key: 'page', width: 10 },
      { header: 'Data Raw', key: 'date_raw', width: 15 },
      { header: 'Data Formatada', key: 'date_formatted', width: 15 },
      { header: 'Entrada 1', key: 'in1', width: 12 },
      { header: 'Saída 1', key: 'out1', width: 12 },
      { header: 'Entrada 2', key: 'in2', width: 12 },
      { header: 'Saída 2', key: 'out2', width: 12 },
      { header: 'Total Horas', key: 'total', width: 15 },
      { header: 'Observações', key: 'obs', width: 25 },
    ];

    for (const page of pages) {
      const pageNum = page.page || 1;
      const days = page.days || [];
      for (const day of days) {
        const punches = day.punches || [];
        worksheet.addRow({
          page: pageNum,
          date_raw: day.date_raw || '',
          date_formatted: day.date_formatted || '',
          in1: punches[0] ? (punches[0].time_hhmm || punches[0].time_raw || '') : '',
          out1: punches[1] ? (punches[1].time_hhmm || punches[1].time_raw || '') : '',
          in2: punches[2] ? (punches[2].time_hhmm || punches[2].time_raw || '') : '',
          out2: punches[3] ? (punches[3].time_hhmm || punches[3].time_raw || '') : '',
          total: day.total_worked_hours || '',
          obs: (day.alerts || []).join('; '),
        });
      }
    }
  } else if (job.tipo === 'holerite') {
    // Coleta labels únicos por chave canônica + classifica tipo (provento/desconto) para colorir
    const verbaKeyMap = new Map(); // chave → { label, type }
    const baseKeyMap = new Map();  // chave → label

    for (const page of pages) {
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (!label) continue;
        const key = normalizeLabelKey(label);
        if (!verbaKeyMap.has(key)) {
          verbaKeyMap.set(key, { label, type: item.type || 'provento' });
        } else if (label.length > verbaKeyMap.get(key).label.length) {
          verbaKeyMap.set(key, { label, type: item.type || verbaKeyMap.get(key).type });
        }
      }
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (!label) continue;
        const key = normalizeLabelKey(label);
        if (!baseKeyMap.has(key)) baseKeyMap.set(key, label);
      }
    }

    const columns = [
      { header: 'Página', key: 'page', width: 10 },
      { header: 'Competência', key: 'competencia', width: 14 }
    ];

    Array.from(verbaKeyMap.entries()).forEach(([key, { label }], idx) => {
      columns.push({ header: label, key: `v_${idx}`, width: Math.max(label.length + 4, 16) });
    });

    Array.from(baseKeyMap.entries()).forEach(([key, label], idx) => {
      columns.push({ header: label, key: `b_${idx}`, width: Math.max(label.length + 4, 16) });
    });

    worksheet.columns = columns;

    for (const page of pages) {
      const pageNum = page.page || 1;
      const comp = (page.month && page.year) ? `${page.month}/${page.year}` : '';

      // Monta mapa de verbas por chave canônica
      const fieldMap = {};
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) fieldMap[normalizeLabelKey(label)] = item.value || '';
      }

      const baseMap = {};
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) baseMap[normalizeLabelKey(label)] = item.value || '';
      }

      const rowObj = { page: pageNum, competencia: comp };

      Array.from(verbaKeyMap.keys()).forEach((key, idx) => {
        rowObj[`v_${idx}`] = fieldMap[key] || '';
      });

      Array.from(baseKeyMap.keys()).forEach((key, idx) => {
        rowObj[`b_${idx}`] = baseMap[key] || '';
      });

      worksheet.addRow(rowObj);
    }


    // ====== Estilização especial do cabeçalho por tipo de coluna ======
    // Aplica estilo base azul escuro em todas as colunas do cabeçalho do holerite primeiro
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Cores específicas por coluna: verbas verdes/vermelhas, bases azuis
    const verbaEntries = Array.from(verbaKeyMap.entries());
    const baseEntries = Array.from(baseKeyMap.entries());


    // Col 1 = Página, Col 2 = Competência (azul escuro default)
    // Col 3..N = verbas (verde provento / vermelho desconto)
    // Col N+1.. = bases (azul médio)
    verbaEntries.forEach(([key, { label, type }], idx) => {
      const colIndex = idx + 3; // 1-indexed, começa na coluna 3
      const cell = headerRow.getCell(colIndex);
      if (type === 'desconto') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C0392B' } }; // vermelho
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '27AE60' } }; // verde
      }
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    baseEntries.forEach(([key, label], idx) => {
      const colIndex = verbaEntries.length + idx + 3;
      const cell = headerRow.getCell(colIndex);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2980B9' } }; // azul médio
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }

  // Estilização base dos cabeçalhos para Cartão de Ponto (holerite já estilizou internamente)
  if (job.tipo !== 'holerite') {
    const baseHeaderRow = worksheet.getRow(1);
    baseHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    baseHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E3A8A' }
    };
    baseHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    content: Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `transcricao_${job.id}_${job.tipo}.xlsx`
  };
}
