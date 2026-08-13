/**
 * MÃ³dulo determinÃ­stico para anÃ¡lise de densidade de texto por pÃ¡gina PDF.
 * Permite selecionar a estratÃ©gia ideal de prompts (Single-Pass vs Multi-Pass)
 * para otimizar consumo de tokens e chamadas de API sem perder precisÃ£o.
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
 * Seleciona a estratÃ©gia de extraÃ§Ã£o com base nas mÃ©tricas da pÃ¡gina.
 * 
 * @param {Object} density MÃ©tricas calculadas por analyzePageDensity
 * @param {boolean} isFicha Indica se o documento foi identificado como Ficha Financeira
 * @returns {'FICHA_BLOCK' | 'VISION_SINGLE_PASS' | 'SINGLE_PASS' | 'DUAL_PASS'} EstratÃ©gia de extraÃ§Ã£o recomendada
 */
export function selectExtractionStrategy(density, isFicha = false) {
  if (isFicha) {
    return 'FICHA_BLOCK';
  }

  if (density.isScanned || density.charCount < 50) {
    return 'VISION_SINGLE_PASS';
  }

  // Precisão primeiro: a antiga otimização SINGLE_PASS reduziu a cobertura em
  // layouts aparentemente simples. Todo PDF textual usa verbas + rodapé em
  // passes independentes; a densidade serve para segmentação, não para omitir passes.
  return 'DUAL_PASS';
}

