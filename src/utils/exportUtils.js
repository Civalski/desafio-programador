import ExcelJS from 'exceljs';

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
  const pages = job.value.pages || [];
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
    const verbaKeys = [];
    const baseKeys = [];

    for (const page of pages) {
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label && !verbaKeys.includes(label)) {
          verbaKeys.push(label);
        }
      }
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label && !baseKeys.includes(label)) {
          baseKeys.push(label);
        }
      }
    }

    const allKeys = [...verbaKeys, ...baseKeys];
    const headers = ['Página', 'Competência', ...allKeys];
    rows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

    for (const page of pages) {
      const pageNum = page.page || 1;
      const comp = (page.month && page.year) ? `${page.month}/${page.year}` : '';

      const fieldMap = {};
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) fieldMap[label] = item.value || '';
      }

      const baseMap = {};
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) baseMap[label] = item.value || '';
      }

      const rowValues = [pageNum, `"${comp}"`];
      for (const key of verbaKeys) {
        const val = fieldMap[key] || '';
        rowValues.push(`"${String(val).replace(/"/g, '""')}"`);
      }
      for (const key of baseKeys) {
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

  const pages = job.value?.pages || [];

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
    const verbaKeys = [];
    const baseKeys = [];

    for (const page of pages) {
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label && !verbaKeys.includes(label)) {
          verbaKeys.push(label);
        }
      }
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label && !baseKeys.includes(label)) {
          baseKeys.push(label);
        }
      }
    }

    const columns = [
      { header: 'Página', key: 'page', width: 10 },
      { header: 'Competência', key: 'competencia', width: 14 }
    ];

    verbaKeys.forEach((key, idx) => {
      columns.push({ header: key, key: `v_${idx}`, width: Math.max(key.length + 4, 16) });
    });

    baseKeys.forEach((key, idx) => {
      columns.push({ header: key, key: `b_${idx}`, width: Math.max(key.length + 4, 16) });
    });

    worksheet.columns = columns;

    for (const page of pages) {
      const pageNum = page.page || 1;
      const comp = (page.month && page.year) ? `${page.month}/${page.year}` : '';

      const fieldMap = {};
      for (const item of (page.fields || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) fieldMap[label] = item.value || '';
      }

      const baseMap = {};
      for (const item of (page.bases || [])) {
        const label = (item.label || item.description || '').trim();
        if (label) baseMap[label] = item.value || '';
      }

      const rowObj = {
        page: pageNum,
        competencia: comp
      };

      verbaKeys.forEach((key, idx) => {
        rowObj[`v_${idx}`] = fieldMap[key] || '';
      });

      baseKeys.forEach((key, idx) => {
        rowObj[`b_${idx}`] = baseMap[key] || '';
      });

      worksheet.addRow(rowObj);
    }
  }

  // Estilização dos cabeçalhos da planilha
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E3A8A' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    content: Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `transcricao_${job.id}_${job.tipo}.xlsx`
  };
}
