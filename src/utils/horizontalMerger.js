/**
 * Utilitário de Merge Determinístico para Combinação de Extrações Horizontais (Esquerda + Direita).
 * Combina os resultados de extração da região Esquerda (A) e Direita (B) sem duplicações resultantes de overlap.
 */

/**
 * Combina as verbas de uma página extraídas da região esquerda e direita.
 * @param {Array<Object>} leftFields Verbas da esquerda
 * @param {Array<Object>} rightFields Verbas da direita
 * @returns {Array<Object>} Verbas combinadas e deduplicadas
 */
export function mergeFields(leftFields = [], rightFields = []) {
  const mergedFields = [];
  const processedKeys = new Set();

  // 1. Processa todas as verbas extraídas da Esquerda
  leftFields.forEach(lField => {
    const code = (lField.code || '').trim();
    const label = (lField.label || '').trim();
    const key = code ? `${code}-${label.toLowerCase()}` : label.toLowerCase();

    // Procura verba correspondente na extração da Direita (por código e/ou label)
    const matchRight = rightFields.find(rField => {
      const rCode = (rField.code || '').trim();
      const rLabel = (rField.label || '').trim();
      if (code && rCode && code === rCode) return true;
      if (label && rLabel && label.toLowerCase() === rLabel.toLowerCase()) return true;
      return false;
    });

    let finalRef = (lField.reference || '').trim();
    let finalVal = (lField.value || '').trim();

    if (matchRight) {
      // Se a Direita possui o valor monetário R$, prioriza o valor da Direita
      if ((!finalVal || finalVal === '0,00') && matchRight.value) {
        finalVal = matchRight.value.trim();
      }
      // Se a Esquerda não tinha referência mas a Direita possui, utiliza da Direita
      if (!finalRef && matchRight.reference) {
        finalRef = matchRight.reference.trim();
      }
    }

    processedKeys.add(key);
    mergedFields.push({
      code: code || (matchRight ? matchRight.code : ''),
      label: label || (matchRight ? matchRight.label : ''),
      reference: finalRef,
      value: finalVal
    });
  });

  // 2. Processa verbas presentes apenas na Direita (que não foram pareadas com a Esquerda)
  rightFields.forEach(rField => {
    const rCode = (rField.code || '').trim();
    const rLabel = (rField.label || '').trim();
    const key = rCode ? `${rCode}-${rLabel.toLowerCase()}` : rLabel.toLowerCase();

    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      mergedFields.push({
        code: rCode,
        label: rLabel,
        reference: (rField.reference || '').trim(),
        value: (rField.value || '').trim()
      });
    }
  });

  return mergedFields;
}

/**
 * Combina os totais e bases de cálculo da região esquerda e direita sem duplicar.
 * @param {Array<Object>} leftBases 
 * @param {Array<Object>} rightBases 
 * @returns {Array<Object>}
 */
export function mergeBases(leftBases = [], rightBases = []) {
  const merged = [];
  const seenKeys = new Set();

  [...leftBases, ...rightBases].forEach(base => {
    if (!base || !base.label) return;
    const label = base.label.trim();
    const value = (base.value || '').trim();
    const key = `${label.toLowerCase()}-${value}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      merged.push({ label, value });
    }
  });

  return merged;
}

/**
 * Realiza o merge determinístico de dois objetos DTO de resultado (Esquerda + Direita).
 * @param {Object} leftResult DTO extraído da região Esquerda
 * @param {Object} rightResult DTO extraído da região Direita
 * @returns {Object} DTO combinado no formato padrão { pages: [...] }
 */
export function mergeHorizontalExtractions(leftResult = {}, rightResult = {}) {
  const leftPages = leftResult.pages || [];
  const rightPages = rightResult.pages || [];

  if (leftPages.length === 0) return rightResult;
  if (rightPages.length === 0) return leftResult;

  const mergedPages = [];
  const maxLen = Math.max(leftPages.length, rightPages.length);

  for (let i = 0; i < maxLen; i++) {
    const lPage = leftPages[i] || {};
    const rPage = rightPages[i] || {};

    const month = lPage.month || rPage.month || '';
    const year = lPage.year || rPage.year || '';
    const fields = mergeFields(lPage.fields || [], rPage.fields || []);
    const bases = mergeBases(lPage.bases || [], rPage.bases || []);

    mergedPages.push({
      page: lPage.page || rPage.page || 1,
      index: lPage.index !== undefined ? lPage.index : (rPage.index || 0),
      yStart: lPage.yStart !== undefined ? lPage.yStart : rPage.yStart,
      yEnd: lPage.yEnd !== undefined ? lPage.yEnd : rPage.yEnd,
      month,
      year,
      fields,
      bases,
      isHorizontalMerged: true
    });
  }

  return { pages: mergedPages };
}
