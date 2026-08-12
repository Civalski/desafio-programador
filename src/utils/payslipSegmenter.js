/**
 * Módulo de Segmentação Automática de Holerites por Página PDF.
 * Analisa deterministicamente a estrutura da página (bounding boxes, cabeçalhos, rodapés e lacunas verticais)
 * para identificar as regiões correspondentes aos holerites individuais dentro de cada página.
 */

// Padrões de início de holerite (headers)
const HEADER_PATTERNS = [
  /\bFolha\s+Normal\b/i,
  /\bFolha\s+de\s+Pagamento\b/i,
  /\bDemonstrativo\s+de\s+Pagamento\b/i,
  /\bRecibo\s+de\s+Pagamento\b/i,
  /\bFicha\s+Financeira\b/i,
  /\bDeclaração\s+Remuneração\b/i,
  /\bComprovante\s+de\s+Rendimento\b/i,
  /\bMês\/Ano\s*:/i,
  /\bMês\s*:\s*[a-z]{3}-\d{2}\b/i,
  /\bCompetência\s*:/i,
  /\bPeríodo\s*:\s*\d{1,2}\/\d{2,4}\b/i,
  /\bNo\.\s*Pessoal\s*:/i
];

// Padrões de término de holerite (footers/totais)
const FOOTER_PATTERNS = [
  /\bTOTAL\s*DESCONTOS\b/i,
  /\bTOTALDESCONTOS\b/i,
  /\bSALARIOLIQUIDONOMES\b/i,
  /\bSALARIO\s*LIQUIDO\b/i,
  /\bProventos\s+Líquidos\b/i,
  /\bVALORDOIRFARECOLHER\b/i,
  /\bLíqüido\b/i,
  /\bLíquido\b/i,
  /\bBase\s+I\.N\.S\.S\.\b/i
];

/**
 * Agrupa itens de texto por linhas (Y idêntico ou muito próximo).
 * @param {Array<Object>} items 
 * @param {number} tolerance 
 * @returns {Array<{ y: number, text: string, items: Array<Object> }>}
 */
function groupItemsIntoLines(items, tolerance = 3) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const lineMap = [];

  items.forEach(item => {
    if (!item || typeof item.str !== 'string' || !item.str.trim()) return;
    
    let existingLine = lineMap.find(line => Math.abs(line.y - item.y) <= tolerance);
    if (!existingLine) {
      existingLine = { y: item.y, items: [] };
      lineMap.push(existingLine);
    }
    existingLine.items.push(item);
  });

  lineMap.sort((a, b) => a.y - b.y);

  return lineMap.map(line => {
    line.items.sort((a, b) => a.x - b.x);
    const text = line.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    return {
      y: line.y,
      text,
      items: line.items
    };
  });
}

/**
 * Segmenta os holerites contidos em uma página PDF.
 * @param {Array<Object>} pageContent Itens de texto extraídos do PDF
 * @param {Object} [pageInfo] Metadados da página (height, width, num)
 * @returns {Array<{ page: number, index: number, yStart: number, yEnd: number, items: Array<Object>, headerText?: string }>}
 */
export function segmentPagePayslips(pageContent = [], pageInfo = {}) {
  const pageNum = pageInfo.num || pageInfo.page || 1;
  const pageHeight = pageInfo.height || 842; // A4 standard point height ~842

  if (!Array.isArray(pageContent) || pageContent.length === 0) {
    return [{
      page: pageNum,
      index: 0,
      yStart: 0,
      yEnd: pageHeight,
      items: [],
      confidence: 1.0,
      isFallback: true
    }];
  }

  const lines = groupItemsIntoLines(pageContent, 3);
  if (lines.length === 0) {
    return [{
      page: pageNum,
      index: 0,
      yStart: 0,
      yEnd: pageHeight,
      items: pageContent,
      confidence: 1.0,
      isFallback: true
    }];
  }

  // 1. Encontra linhas marcadoras de início (Headers)
  const headerLines = [];
  lines.forEach(line => {
    const isHeaderMatch = HEADER_PATTERNS.some(pattern => pattern.test(line.text));
    if (isHeaderMatch) {
      headerLines.push(line);
    }
  });

  // Se houver mais de um cabeçalho muito próximo (ex: "Declaração..." na y=53 e "Mês/Ano:" na y=103),
  // agrupa cabeçalhos que pertencem ao mesmo holerite (distância vertical < 55pt)
  const groupedHeaders = [];
  headerLines.forEach(h => {
    const last = groupedHeaders[groupedHeaders.length - 1];
    if (!last || Math.abs(h.y - last.y) > 55) {
      groupedHeaders.push(h);
    }
  });

  // 2. Encontra linhas marcadoras de término (Footers)
  const footerLines = [];
  lines.forEach(line => {
    const isFooterMatch = FOOTER_PATTERNS.some(pattern => pattern.test(line.text));
    if (isFooterMatch) {
      footerLines.push(line);
    }
  });

  const groupedFooters = [];
  footerLines.forEach(f => {
    const last = groupedFooters[groupedFooters.length - 1];
    if (!last || Math.abs(f.y - last.y) > 30) {
      groupedFooters.push(f);
    }
  });

  // Se detectamos 2 ou mais holerites via cabeçalhos repetidos
  if (groupedHeaders.length >= 2) {
    const regions = [];
    const minPageY = lines[0].y;
    const maxPageY = lines[lines.length - 1].y;

    for (let i = 0; i < groupedHeaders.length; i++) {
      const currentHeader = groupedHeaders[i];
      const nextHeader = groupedHeaders[i + 1];

      // Ponto de início da região: um pouco acima do cabeçalho (margem de 10pt)
      const yStart = i === 0 
        ? Math.max(0, currentHeader.y - 20) 
        : currentHeader.y - 8;

      let yEnd;
      if (nextHeader) {
        // Tenta achar um footer entre currentHeader e nextHeader
        const matchingFooter = groupedFooters.find(f => f.y > currentHeader.y && f.y < nextHeader.y);
        if (matchingFooter) {
          yEnd = matchingFooter.y + 15;
        } else {
          yEnd = nextHeader.y - 5;
        }
      } else {
        // Último holerite da página
        const matchingFooter = groupedFooters.find(f => f.y > currentHeader.y);
        if (matchingFooter) {
          yEnd = Math.min(pageHeight, matchingFooter.y + 25);
        } else {
          yEnd = Math.min(pageHeight, maxPageY + 15);
        }
      }

      // Filtra os itens de texto pertencentes a esta região
      const regionItems = pageContent.filter(item => {
        if (!item || typeof item.y !== 'number') return false;
        return item.y >= yStart - 2 && item.y <= yEnd + 2;
      });

      regions.push({
        page: pageNum,
        index: i,
        yStart: Math.round(yStart * 100) / 100,
        yEnd: Math.round(yEnd * 100) / 100,
        items: regionItems,
        headerText: currentHeader.text,
        confidence: 0.95,
        isFallback: false
      });
    }

    return regions;
  }

  // Se não encontrou múltiplos headers, verifica se há múltiplos footers repetidos
  if (groupedFooters.length >= 2) {
    const regions = [];
    let prevYEnd = 0;

    for (let i = 0; i < groupedFooters.length; i++) {
      const currentFooter = groupedFooters[i];
      const yStart = prevYEnd;
      const yEnd = currentFooter.y + 20;

      const regionItems = pageContent.filter(item => item.y >= yStart && item.y <= yEnd);
      regions.push({
        page: pageNum,
        index: i,
        yStart: Math.round(yStart * 100) / 100,
        yEnd: Math.round(yEnd * 100) / 100,
        items: regionItems,
        confidence: 0.85,
        isFallback: false
      });
      prevYEnd = yEnd;
    }

    return regions;
  }

  // Fallback seguro: Retorna a página inteira como uma única região
  return [{
    page: pageNum,
    index: 0,
    yStart: 0,
    yEnd: pageHeight,
    items: pageContent,
    confidence: 1.0,
    isFallback: true
  }];
}

/**
 * Avalia se a região de um holerite é complexa (alta densidade horizontal de colunas/itens).
 * @param {Array<Object>} items 
 * @param {Object} [options]
 * @returns {{ isComplex: boolean, colCount: number, maxItemsPerLine: number, xMin: number, xMax: number }}
 */
export function evaluateHoleriteComplexity(items = [], options = {}) {
  const threshold = options.columnThreshold || 6;
  if (!Array.isArray(items) || items.length === 0) {
    return { isComplex: false, colCount: 0, maxItemsPerLine: 0, xMin: 0, xMax: 595 };
  }

  const xPositions = items.map(i => i.x).filter(x => typeof x === 'number');
  if (xPositions.length === 0) {
    return { isComplex: false, colCount: 0, maxItemsPerLine: 0, xMin: 0, xMax: 595 };
  }

  const xMin = Math.min(...xPositions);
  const xMax = Math.max(...items.map(i => i.x + (i.width || 0)));

  // Conta colunas X distintas com tolerância de 12pt
  const xClusters = [];
  const sortedX = [...xPositions].sort((a, b) => a - b);
  sortedX.forEach(x => {
    const existing = xClusters.find(c => Math.abs(c - x) <= 12);
    if (!existing) {
      xClusters.push(x);
    }
  });

  const lines = groupItemsIntoLines(items, 3);
  const maxItemsPerLine = Math.max(0, ...lines.map(l => l.items.length));

  const isComplex = xClusters.length >= threshold || maxItemsPerLine >= (options.itemsPerLineThreshold || 7);

  return {
    isComplex,
    colCount: xClusters.length,
    maxItemsPerLine,
    xMin,
    xMax
  };
}

/**
 * Encontra o ponto de corte horizontal ideal entre duas colunas (no canalete/gutter),
 * evitando cortar bounding boxes de texto ao meio.
 * @param {Array<Object>} items 
 * @param {number} xMin 
 * @param {number} xMax 
 * @returns {number} Ponto de corte xCut
 */
export function findOptimalHorizontalCut(items = [], xMin = 0, xMax = 595) {
  const midpoint = xMin + (xMax - xMin) / 2;
  const searchRadius = (xMax - xMin) * 0.25;

  const candidateMin = midpoint - searchRadius;
  const candidateMax = midpoint + searchRadius;

  const boxes = items.map(item => {
    const start = item.x || 0;
    const end = start + (item.width || 20);
    return { start, end };
  });

  let bestX = midpoint;
  let minIntersections = Infinity;

  for (let candidateX = candidateMin; candidateX <= candidateMax; candidateX += 2) {
    let cuts = 0;
    boxes.forEach(b => {
      if (candidateX > b.start + 1 && candidateX < b.end - 1) {
        cuts++;
      }
    });

    const distFromCenter = Math.abs(candidateX - midpoint);
    const score = cuts * 1000 + distFromCenter;

    if (score < minIntersections) {
      minIntersections = score;
      bestX = candidateX;
    }
  }

  return Math.round(bestX * 100) / 100;
}

/**
 * Divide a região de um holerite horizontalmente em Esquerda (A) e Direita (B) com área de sobreposição (overlap).
 * @param {Object} region 
 * @param {Object} [options] 
 * @returns {{ leftRegion: Object, rightRegion: Object, xCut: number, overlap: number }}
 */
export function splitRegionHorizontally(region, options = {}) {
  const items = region.items || [];
  const comp = evaluateHoleriteComplexity(items, options);
  
  const overlap = options.overlap || 20;
  const xCut = findOptimalHorizontalCut(items, comp.xMin, comp.xMax);

  const leftItems = items.filter(item => item.x <= xCut + overlap);
  const rightItems = items.filter(item => (item.x + (item.width || 0)) >= xCut - overlap);

  const leftRegion = {
    ...region,
    subIndex: 'left',
    xStart: comp.xMin,
    xEnd: xCut + overlap,
    items: leftItems
  };

  const rightRegion = {
    ...region,
    subIndex: 'right',
    xStart: xCut - overlap,
    xEnd: comp.xMax,
    items: rightItems
  };

  return {
    leftRegion,
    rightRegion,
    xCut,
    overlap
  };
}

