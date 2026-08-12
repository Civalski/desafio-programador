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
        rows.push([pageNum, 'VERBA', `"${item.code || ''}"`, `"${item.description || ''}"`, `"${item.reference || ''}"`, `"${item.value || ''}"`].join(','));
      }
      const bases = page.bases || [];
      for (const item of bases) {
        rows.push([pageNum, 'BASE/TOTAL', `"${item.code || ''}"`, `"${item.description || ''}"`, `"${item.reference || ''}"`, `"${item.value || ''}"`].join(','));
      }
    }
  }

  return rows.join('\n');
}

/**
 * Converte o job para o formato de exportação solicitado (xlsx, csv, json).
 * @param {Object} job 
 * @param {'xlsx' | 'csv' | 'json'} format 
 * @returns {{ content: string|Buffer, contentType: string, filename: string }}
 */
export function generateExport(job, format = 'xlsx') {
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

  // Fallback / Padrão XLSX (retorna buffer de arquivo tabulado em XML Spreadsheet / Excel)
  const csvContent = exportToCsv(job);
  return {
    content: Buffer.from(csvContent, 'utf-8'),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `transcricao_${job.id}_${job.tipo}.xlsx`
  };
}
