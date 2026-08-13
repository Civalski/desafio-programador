/**
 * Módulo determinístico para análise de densidade de texto por página PDF.
 * Permite selecionar a estratégia ideal de prompts (Single-Pass vs Multi-Pass)
 * para otimizar consumo de tokens e chamadas de API sem perder precisão.
 */

export function analyzePageDensity(pageContent = []) {
  if (!Array.isArray(pageContent)) {
    return { charCount: 0, elementCount: 0, lineCount: 0, isSparse: true, isScanned: true };
  }

  let charCount = 0;
  const elementCount = pageContent.length;
  const yBuckets = new Set();

  pageContent.forEach(item => {
    if (!item || typeof item.str !== 'string') return;
    const str = item.str.trim();
    if (str.length > 0) {
      charCount += str.length;
      const yBucket = Math.round((item.y || 0) / 4) * 4;
      yBuckets.add(yBucket);
    }
  });

  return {
    charCount,
    elementCount,
    lineCount: yBuckets.size,
    isSparse: charCount < 100,
    isScanned: charCount < 50 || (elementCount <= 4 && charCount < 200)
  };
}

/**
 * Seleciona a estratégia de extração com base nas métricas da página.
 * 
 * @param {Object} density Métricas calculadas por analyzePageDensity
 * @param {boolean} isFicha Indica se o documento foi identificado como Ficha Financeira
 * @returns {'FICHA_BLOCK' | 'VISION_SINGLE_PASS' | 'SINGLE_PASS' | 'DUAL_PASS'} Estratégia de extração recomendada
 */
export function selectExtractionStrategy(density, isFicha = false) {
  if (isFicha) {
    return 'FICHA_BLOCK';
  }

  if (density.isScanned || density.charCount < 50) {
    return 'VISION_SINGLE_PASS';
  }

  // Documentos pequenos/médios ou simples (< 1500 chars ou < 180 elementos)
  // podem ser extraídos perfeitamente com 1 única chamada (Single-Pass)
  if (density.charCount < 1500 || density.elementCount < 180 || density.isSparse) {
    return 'SINGLE_PASS';
  }

  // Documentos densos (> 1500 chars e muitos elementos) usam 2 chamadas (Unified + Totais)
  return 'DUAL_PASS';
}

/**
 * Time-card pages use vision only when their text layer is not usable.
 */
export function selectTimeCardExtractionStrategy(density = {}) {
  if (density.isScanned || density.charCount < 50) return 'VISION_SINGLE_PASS';
  return density.charCount > 2500 ? 'DUAL_PASS' : 'SINGLE_PASS';
}
