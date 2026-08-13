/**
 * Utilitários para validação de dados, sanitização de caracteres incertos (?) e regras de negócio.
 */

/**
 * Valida se uma string no formato DD/MM/YYYY ou DD/MM é uma data real e possível.
 * Datas como 38/07 ou mês 13 retornam false.
 * @param {string} dateStr 
 * @returns {boolean}
 */
export function isValidDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (dateStr.includes('?')) return false;

  const parts = dateStr.trim().split(/[/.-]/);
  if (parts.length < 2) return false;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parts[2] ? parseInt(parts[2], 10) : 2024;

  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Validação estrita de dias por mês
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/**
 * Substitui caracteres de um texto por '?' se a confiança OCR for abaixo do limite.
 * @param {string} text 
 * @param {number} confidence Score entre 0 e 1
 * @param {number} threshold Limite mínimo de confiança (default 0.7)
 * @returns {string}
 */
export function applyUncertainty(text, confidence, threshold = 0.7) {
  if (!text) return '';
  if (confidence === undefined || confidence === null || confidence >= threshold) {
    return text;
  }
  // Se a confiança for baixa, mascara caracteres alfanuméricos com '?'
  return text.replace(/[a-zA-Z0-9]/g, '?');
}

/**
 * Normaliza um horário bruto para o formato HH:MM (24 horas).
 * Preserva caracteres '?' caso existam na entrada.
 * @param {string} timeRaw 
 * @returns {string}
 */
export function normalizeTimeHHMM(timeRaw) {
  if (!timeRaw || typeof timeRaw !== 'string') return '??:??';
  
  const cleaned = timeRaw.trim().replace(/[^\d:?]/g, '');
  if (cleaned.includes('?')) {
    return cleaned;
  }

  const parts = cleaned.split(':');
  if (parts.length === 2) {
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Tenta extrair 4 dígitos (ex: "0825" -> "08:25")
  if (cleaned.length === 4 && /^\d+$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
  }

  return timeRaw;
}

/**
 * Formata um valor monetário para string no formato brasileiro (ex: "2.389,77").
 * @param {string|number} rawValue 
 * @returns {string}
 */
export function formatMoneyString(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }
  if (typeof rawValue === 'number') {
    return rawValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(rawValue);
}

export function isNonSequentialCompetency(previous, current) {
  const valid = ({ month, year }) => /^(0[1-9]|1[0-2])$/.test(String(month || '')) && /^\d{4}$/.test(String(year || ''));
  if (!valid(previous) || !valid(current)) return false;
  const expected = new Date(Number(previous.year), Number(previous.month), 1);
  const actual = new Date(Number(current.year), Number(current.month) - 1, 1);
  return expected.getTime() !== actual.getTime();
}

/**
 * Realiza a auditoria global sobre o conjunto de competências (mês/ano) e holerites do documento.
 * @param {Object} dto Objeto DTO contendo { pages: [...] }
 * @returns {Object} Resultado detalhado da auditoria global
 */
export function auditGlobalPayroll(dto = {}) {
  const pages = dto.pages || [];
  const competenciesCount = {};
  const identifiedCompetencies = [];
  const duplicates = [];
  const invalidFormats = [];
  const yearInconsistencies = [];
  const missingEvidence = [];
  const inferredCompetencies = [];
  const warnings = [];
  const eventCounts = new Map();
  const competencyTypes = new Map();

  const yearsFound = new Set();

  pages.forEach((page, pageIdx) => {
    const pageNum = page.page || (pageIdx + 1);
    const month = String(page.month || '').trim();
    const year = String(page.year || '').trim();

    // 5 & 6. Verifica ausência de evidência / competência não identificada
    if (!month || !year) {
      missingEvidence.push({
        page: pageNum,
        month,
        year,
        reason: 'Competência (mês ou ano) não identificada na página'
      });
      warnings.push(`Página ${pageNum}: Competência não evidenciada no documento.`);
      return;
    }

    if (page.isInferred || page.isFallbackCompetency) {
      inferredCompetencies.push({
        page: pageNum,
        month,
        year
      });
      warnings.push(`Página ${pageNum}: Competência ${month}/${year} foi marcada como inferida.`);
    }

    // 3. Validação de Formato
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    const isMonthValid = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12;
    const isYearValid = !isNaN(yearNum) && yearNum >= 1990 && yearNum <= 2100;

    if (!isMonthValid || !isYearValid || month.includes('?') || year.includes('?')) {
      invalidFormats.push({
        page: pageNum,
        month,
        year,
        reason: !isMonthValid ? 'Mês inválido' : (!isYearValid ? 'Ano inválido' : 'Formato ambíguo')
      });
      warnings.push(`Página ${pageNum}: Formato de competência inválido ou ambíguo (${month}/${year}).`);
    } else {
      yearsFound.add(yearNum);
      const formattedComp = `${month.padStart(2, '0')}/${year}`;
      if (!identifiedCompetencies.includes(formattedComp)) {
        identifiedCompetencies.push(formattedComp);
      }
      competenciesCount[formattedComp] = (competenciesCount[formattedComp] || 0) + 1;
      const payrollType = page.payrollType || 'normal';
      const eventKey = `${formattedComp}|${payrollType}`;
      if (!eventCounts.has(eventKey)) eventCounts.set(eventKey, []);
      eventCounts.get(eventKey).push(page.recordKey || `${pageNum}:${page.blockIndex ?? 'page'}`);
      if (!competencyTypes.has(formattedComp)) competencyTypes.set(formattedComp, new Set());
      competencyTypes.get(formattedComp).add(payrollType);
    }
  });

  // 2. Detecção de Duplicidades
  Object.keys(competenciesCount).forEach((comp) => {
    if (competenciesCount[comp] > 1) {
      duplicates.push(comp);
      warnings.push(`Competência ${comp} aparece duplicada (${competenciesCount[comp]} vezes) no documento. Verificar se é caso legítimo (ex: 13º salário, adiantamento ou rescisão).`);
    }
  });

  // 4. Inconsistências de Ano entre Páginas
  const legitimateRepeatedCompetencies = [...competencyTypes.entries()]
    .filter(([, types]) => types.size > 1)
    .map(([competency, types]) => ({ competency, payrollTypes: [...types] }));
  for (const legitimate of legitimateRepeatedCompetencies) {
    const index = duplicates.indexOf(legitimate.competency);
    if (index >= 0) duplicates.splice(index, 1);
    for (let warningIndex = warnings.length - 1; warningIndex >= 0; warningIndex--) {
      if (warnings[warningIndex].includes(legitimate.competency) && warnings[warningIndex].includes('duplicada')) warnings.splice(warningIndex, 1);
    }
  }
  for (const [eventKey, recordKeys] of eventCounts) {
    if (recordKeys.length <= 1) continue;
    const [competency, payrollType] = eventKey.split('|');
    if (!duplicates.some(item => typeof item === 'object' && item.competency === competency && item.payrollType === payrollType)) {
      duplicates.push({ competency, payrollType, recordKeys });
    }
  }

  if (yearsFound.size > 2) {
    const yearList = Array.from(yearsFound).sort((a, b) => a - b);
    yearInconsistencies.push({
      years: yearList,
      reason: `Documento contém holerites de ${yearList.length} anos distintos (${yearList.join(', ')})`
    });
    warnings.push(`Atenção: O documento possui holerites de múltiplos anos distintos (${yearList.join(', ')}).`);
  }

  const status = (duplicates.length > 0 || invalidFormats.length > 0 || missingEvidence.length > 0 || yearInconsistencies.length > 0 || inferredCompetencies.length > 0)
    ? 'review_required'
    : 'ok';

  return {
    status,
    competencies: identifiedCompetencies,
    duplicates,
    legitimateRepeatedCompetencies,
    invalidFormats,
    yearInconsistencies,
    missingEvidence,
    inferredCompetencies,
    warnings
  };
}
