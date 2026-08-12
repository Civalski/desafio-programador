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
    rows.push(['Página', 'Categoria', 'Código', 'Descrição', 'Referência', 'Valor'].join(','));
    for (const page of pages) {
      const pageNum = page.page || 1;
      const fields = page.fields || [];
      for (const item of fields) {
        rows.push([pageNum, 'VERBA', `"${item.code || ''}"`, `"${item.label || item.description || ''}"`, `"${item.reference || ''}"`, `"${item.value || ''}"`].join(','));
      }
      const bases = page.bases || [];
      for (const item of bases) {
        rows.push([pageNum, 'BASE/TOTAL', `"${item.code || ''}"`, `"${item.label || item.description || ''}"`, `"${item.reference || ''}"`, `"${item.value || ''}"`].join(','));
      }
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
    worksheet.columns = [
      { header: 'Página', key: 'page', width: 10 },
      { header: 'Categoria', key: 'category', width: 15 },
      { header: 'Código', key: 'code', width: 12 },
      { header: 'Descrição / Verba', key: 'label', width: 32 },
      { header: 'Referência', key: 'reference', width: 15 },
      { header: 'Valor (R$)', key: 'value', width: 18 },
    ];

    for (const page of pages) {
      const pageNum = page.page || 1;
      const fields = page.fields || [];
      for (const item of fields) {
        worksheet.addRow({
          page: pageNum,
          category: 'VERBA',
          code: item.code || '',
          label: item.label || item.description || '',
          reference: item.reference || '',
          value: item.value || '',
        });
      }
      const bases = page.bases || [];
      for (const item of bases) {
        worksheet.addRow({
          page: pageNum,
          category: 'BASE/TOTAL',
          code: item.code || '',
          label: item.label || item.description || '',
          reference: item.reference || '',
          value: item.value || '',
        });
      }
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
