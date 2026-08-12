/**
 * Utilitário para Normalização e Deduplicação de Labels de Verbas de Holerite.
 * Resolve o problema de colunas duplicadas causadas por variações de escrita do mesmo item.
 * Ex: "SAL. BASE", "SALÁRIO BASE", "Salario Base" → chave canônica: "salario base"
 */

/**
 * Dicionário de aliases comuns em holerites brasileiros.
 * Mapeia variações → chave canônica normalizada.
 */
const LABEL_ALIASES = {
  // Salário
  'sal base': 'salario base',
  'sal. base': 'salario base',
  'sal.base': 'salario base',
  'salario base': 'salario base',
  'salário base': 'salario base',
  'vencimento base': 'salario base',
  'remuneracao base': 'salario base',

  // INSS
  'inss': 'inss',
  'contrib inss': 'inss',
  'contribuicao inss': 'inss',
  'contribuição inss': 'inss',
  'desc inss': 'inss',
  'desconto inss': 'inss',

  // IRRF
  'irrf': 'irrf',
  'ir': 'irrf',
  'imposto renda': 'irrf',
  'imposto de renda': 'irrf',
  'desc irrf': 'irrf',
  'desconto irrf': 'irrf',
  'retencao ir': 'irrf',
  'retenção ir': 'irrf',

  // FGTS
  'fgts': 'fgts',
  'fgts mes': 'fgts',
  'fgts do mes': 'fgts do mes',
  'fgts do mês': 'fgts do mes',
  'deposito fgts': 'fgts do mes',

  // Vale Transporte
  'vt': 'vale transporte',
  'vale transp': 'vale transporte',
  'vale transporte': 'vale transporte',
  'desc vt': 'vale transporte',
  'desconto vt': 'vale transporte',

  // Vale Refeição / Alimentação
  'vr': 'vale refeicao',
  'va': 'vale alimentacao',
  'vale ref': 'vale refeicao',
  'vale refeicao': 'vale refeicao',
  'vale refeição': 'vale refeicao',
  'vale alim': 'vale alimentacao',
  'vale alimentacao': 'vale alimentacao',
  'vale alimentação': 'vale alimentacao',

  // Horas Extras
  'he': 'horas extras',
  'h.e.': 'horas extras',
  'horas extras': 'horas extras',
  'hora extra': 'horas extras',
  'h extras': 'horas extras',

  // Adiantamento
  'adiant': 'adiantamento',
  'adiantamento': 'adiantamento',
  'adiantamento salarial': 'adiantamento salarial',

  // Faltas
  'faltas': 'faltas',
  'falta': 'faltas',
  'desc faltas': 'faltas',
  'desconto faltas': 'faltas',

  // 13º
  '13 salario': '13 salario',
  '13° salario': '13 salario',
  '13° salário': '13 salario',
  'decimo terceiro': '13 salario',
  'décimo terceiro': '13 salario',

  // Bases de Cálculo
  'base inss': 'base inss',
  'base calc inss': 'base inss',
  'base de calculo inss': 'base inss',
  'base irrf': 'base irrf',
  'base ir': 'base irrf',
  'base de calculo ir': 'base irrf',
  'base fgts': 'base fgts',
  'base de calculo fgts': 'base fgts',
  'total proventos': 'total proventos',
  'total vencimentos': 'total proventos',
  'total de proventos': 'total proventos',
  'total descontos': 'total descontos',
  'total de descontos': 'total descontos',
  'valor liquido': 'valor liquido',
  'valor líquido': 'valor liquido',
  'liquido a receber': 'valor liquido',
  'líquido a receber': 'valor liquido',
  'salario liquido': 'valor liquido',
  'salário líquido': 'valor liquido',
};

/**
 * Remove acentuação de uma string.
 * @param {string} str
 * @returns {string}
 */
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza um label para uma chave canônica comparável.
 * Remove acentos, pontuação especial, espaços duplos e coloca em lowercase.
 * @param {string} label
 * @returns {string}
 */
export function normalizeLabelKey(label) {
  if (!label || typeof label !== 'string') return '';

  const key = removeAccents(label)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Substitui pontuação por espaço
    .replace(/\s+/g, ' ')           // Colapsa espaços múltiplos
    .trim();

  // Verifica se há um alias mapeado
  return LABEL_ALIASES[key] || key;
}

/**
 * Procura um label similar em uma lista existente de labels.
 * Retorna o label existente que é considerado equivalente, ou null se nenhum for.
 * @param {string} label Label a procurar
 * @param {string[]} existingLabels Lista de labels já registrados
 * @returns {string | null}
 */
export function findSimilarLabel(label, existingLabels = []) {
  const targetKey = normalizeLabelKey(label);
  if (!targetKey) return null;

  for (const existing of existingLabels) {
    const existingKey = normalizeLabelKey(existing);
    if (existingKey === targetKey) {
      return existing;
    }
  }

  return null;
}

/**
 * Deduplicata e ordena um array de labels de verbas, agrupando similares.
 * Retorna o conjunto canônico de labels únicos (preservando o label original preferido).
 * @param {string[]} labels
 * @returns {string[]}
 */
export function deduplicateLabels(labels = []) {
  const seen = new Map(); // chave canônica → label original preferido

  for (const label of labels) {
    const key = normalizeLabelKey(label);
    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, label);
    }
    // Prefere o label mais longo/completo se já existe um curto
    else {
      const existing = seen.get(key);
      if (label.length > existing.length) {
        seen.set(key, label);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Mapeia um objeto { [label]: valor } para um novo objeto usando labels canônicos.
 * Útil para consolidar fieldMaps com labels variantes.
 * @param {Object} fieldMap
 * @returns {Object}
 */
export function canonicalizeFieldMap(fieldMap = {}) {
  const result = {};

  for (const [label, value] of Object.entries(fieldMap)) {
    const key = normalizeLabelKey(label);
    if (!key) continue;

    // Se já existe um valor para essa chave canônica, preserva o não-vazio
    if (!result[key] || (!result[key].value && value)) {
      result[key] = { originalLabel: label, value };
    } else if (result[key] && !result[key].value && value) {
      result[key].value = value;
    }
  }

  return result;
}
