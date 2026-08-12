/**
 * Segmentador Determinístico para o Formato "Ficha Financeira".
 *
 * Formato: PDF com múltiplos meses empilhados verticalmente em cada página.
 * Cada bloco mensal é iniciado pela linha "Mês: xxx-YY" e termina antes do próximo "Mês:".
 *
 * Exemplo de estrutura por página:
 *   Folha Normal
 *   Mês: abr-17          ← marcador de início do bloco
 *   REMUNERAÇÃOMES ...   ← verbas do mês
 *   TOT.RENDIMENTOS ...
 *   TOTALDESCONTOS ...   ← rodapé do bloco
 *   Folha Normal
 *   Mês: mai-17          ← próximo bloco
 *   ...
 */

const MONTH_MAP = {
  jan: '01', janeiro: '01',
  fev: '02', fevereiro: '02',
  mar: '03', março: '03', marco: '03',
  abr: '04', abril: '04',
  mai: '05', maio: '05',
  jun: '06', junho: '06',
  jul: '07', julho: '07',
  ago: '08', agosto: '08',
  set: '09', setembro: '09',
  out: '10', outubro: '10',
  nov: '11', novembro: '11',
  dez: '12', dezembro: '12',
};

/**
 * Converte "abr-17" ou "abr-2017" → { month: "04", year: "2017" }
 * @param {string} rawMes
 * @returns {{ month: string, year: string } | null}
 */
function parseMesLabel(rawMes) {
  const m = rawMes.trim().match(/^([a-záéíóúâêîôûãõçàèìòùü]+)[\s\-\/](\d{2,4})$/i);
  if (!m) return null;

  const mesAbrev = m[1].toLowerCase().slice(0, 3);
  const month = MONTH_MAP[mesAbrev];
  if (!month) return null;

  let year = m[2];
  if (year.length === 2) year = `20${year}`;

  return { month, year };
}

/**
 * Agrupa itens de texto de uma página por faixa de Y (linha visual).
 * @param {Array<Object>} items  Items de texto do pdf.js-extract
 * @param {number} yTolerance   Tolerância de agrupamento em pixels
 * @returns {Array<{ y: number, items: Array, text: string }>}
 */
function groupItemsIntoLines(items, yTolerance = 4) {
  const linesMap = new Map();

  items.forEach(item => {
    if (!item.str || !item.str.trim()) return;
    const yBucket = Math.round(item.y / yTolerance) * yTolerance;
    if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
    linesMap.get(yBucket).push(item);
  });

  return Array.from(linesMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([y, lineItems]) => {
      const sorted = lineItems.sort((a, b) => a.x - b.x);
      return {
        y,
        items: sorted,
        text: sorted.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()
      };
    })
    .filter(l => l.text.length > 0);
}

/**
 * Detecta se um conjunto de páginas de PDF segue o formato "Ficha Financeira"
 * (múltiplos meses por página, identificados pelo marcador "Mês: xxx-YY").
 *
 * @param {Array<{ content: Array }>} pdfPages  Páginas do pdf.js-extract
 * @returns {boolean}
 */
export function detectFichaFinanceira(pdfPages) {
  const MES_MARKER_REGEX = /^Mês\s*:\s*[a-z]{3,9}[\s\-]\d{2,4}$/i;
  let totalMarkers = 0;

  for (const page of pdfPages) {
    const items = page.content || [];
    const lines = groupItemsIntoLines(items);
    const pageMarkers = lines.filter(l => MES_MARKER_REGEX.test(l.text)).length;
    totalMarkers += pageMarkers;
    // Se já encontrou mais de 1 marcador em qualquer página, é Ficha Financeira
    if (pageMarkers > 1) return true;
  }

  // Ou se o total de marcadores supera o total de páginas (mais de 1 mês/página em média)
  return totalMarkers > pdfPages.length;
}

/**
 * Segmenta os itens de texto de uma página em blocos mensais usando o marcador "Mês: xxx-YY".
 * Cada bloco contém todos os itens entre dois marcadores consecutivos.
 *
 * @param {Array<Object>} pageItems  Items de texto do pdf.js-extract para a página
 * @param {number} pageNum          Número da página (1-indexed)
 * @returns {Array<{
 *   pageNum: number,
 *   blockIndex: number,
 *   month: string,
 *   year: string,
 *   yStart: number,
 *   yEnd: number,
 *   items: Array<Object>,
 *   lines: Array<{ y: number, text: string }>,
 *   rawText: string
 * }>}
 */
export function segmentMonthBlocks(pageItems, pageNum) {
  const MES_MARKER_REGEX = /^Mês\s*:\s*([a-z]{3,9}[\s\-]\d{2,4})$/i;
  const lines = groupItemsIntoLines(pageItems);

  // Encontra todas as linhas-marcadores "Mês: xxx-YY" e suas posições Y
  const markerLines = [];
  lines.forEach((line, idx) => {
    const m = line.text.match(MES_MARKER_REGEX);
    if (m) {
      const parsed = parseMesLabel(m[1]);
      if (parsed) {
        markerLines.push({
          lineIdx: idx,
          y: line.y,
          month: parsed.month,
          year: parsed.year
        });
      }
    }
  });

  if (markerLines.length === 0) return [];

  const blocks = [];

  markerLines.forEach((marker, markerIdx) => {
    const nextMarker = markerLines[markerIdx + 1];

    // Linhas deste bloco: do marcador até o próximo marcador (exclusive)
    const blockLines = lines.slice(
      marker.lineIdx,
      nextMarker ? nextMarker.lineIdx : undefined
    );

    // Items de texto correspondentes a este intervalo de Y
    const yStart = marker.y;
    const yEnd = nextMarker ? nextMarker.y - 1 : Infinity;
    const blockItems = pageItems.filter(item =>
      item.y >= yStart - 2 && (yEnd === Infinity || item.y < yEnd + 2)
    );

    // Texto bruto do bloco para envio ao OpenAI
    const rawText = buildSpatialText(blockItems);

    blocks.push({
      pageNum,
      blockIndex: markerIdx,
      month: marker.month,
      year: marker.year,
      yStart,
      yEnd: nextMarker ? nextMarker.y - 1 : yStart + 200,
      items: blockItems,
      lines: blockLines,
      rawText
    });
  });

  return blocks;
}

/**
 * Segmenta TODAS as páginas de um PDF no formato Ficha Financeira.
 *
 * @param {Array<{ content: Array }>} pdfPages
 * @returns {Array<MonthBlock>}  Lista plana de todos os blocos mensais do documento
 */
export function segmentAllMonthBlocks(pdfPages) {
  const allBlocks = [];

  pdfPages.forEach((page, idx) => {
    const pageNum = idx + 1;
    const items = page.content || [];
    const pageBlocks = segmentMonthBlocks(items, pageNum);
    allBlocks.push(...pageBlocks);
  });

  return allBlocks;
}

/**
 * Constrói texto espacialmente formatado de um bloco de items para envio ao OpenAI.
 * Preserva o alinhamento de colunas usando separadores "|" onde há gaps grandes.
 *
 * @param {Array<Object>} items
 * @returns {string}
 */
export function buildSpatialText(items) {
  const linesMap = new Map();

  items.forEach(item => {
    if (!item.str || !item.str.trim()) return;
    const yBucket = Math.round(item.y / 4) * 4;
    if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
    linesMap.get(yBucket).push(item);
  });

  const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);

  return sortedY.map(y => {
    const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
    let lineStr = '';
    for (let i = 0; i < lineItems.length; i++) {
      if (i > 0) {
        const prev = lineItems[i - 1];
        const curr = lineItems[i];
        const gap = curr.x - (prev.x + (prev.width || 0));
        lineStr += gap > 15 ? '  |  ' : ' ';
      }
      lineStr += lineItems[i].str;
    }
    return lineStr;
  }).join('\n');
}

/**
 * Extrai dados determinísticos de um bloco mensal (sem IA) a partir dos items brutos do PDF.
 *
 * A Ficha Financeira usa 3 colunas lado a lado por linha visual:
 *   Col A (proventos):   código label ref valor   — X menor (lado esquerdo)
 *   Col B (descontos):   código label ref valor   — X médio (centro)
 *   Col C (bases/totais): BASEDECALCULO... valor — X maior (lado direito)
 *
 * Os thresholds de coluna são detectados automaticamente a partir dos dados reais do bloco.
 *
 * @param {Array<Object>} blockItems  Items brutos do pdf.js-extract para o bloco
 * @returns {{ fields: Array, bases: Array, totals: Object }}
 */
export function extractBlockDataLocal(blockItems) {
  const fields = [];
  const bases = [];
  const totals = { totalAdditions: null, totalDeductions: null, netValue: null };
  const seenFieldKeys = new Set();

  if (!blockItems || blockItems.length === 0) return { fields, bases, totals };

  // === Padrões de bases/totais do rodapé (toda a linha) ===
  const BASE_PATTERNS = [
    { regex: /BASEDECALCULODOINSS\s+([\d\.,]+)/i, label: 'Base INSS' },
    { regex: /BASEDECALCULODOIRF\s+([\d\.,]+)/i, label: 'Base IRRF' },
    { regex: /BASEDECALCULODOFGTS\s+([\d\.,]+)/i, label: 'Base FGTS' },
    { regex: /VALORDOFGTS\s+([\d\.,]+)/i, label: 'FGTS do Mês' },
    { regex: /VALORDOIRFARECOLHER\s+([\d\.,]+)/i, label: 'IRRF a Recolher' },
    { regex: /TOT\.?RENDIMENTOS\s+([\d\.,]+)/i, label: 'Total Proventos' },
    { regex: /TOTALDESCONTOS\s+([\d\.,]+)/i, label: 'Total Descontos' },
    { regex: /SALARIOLIQUIDONOMES\s+([\d\.,]+)/i, label: 'Valor Líquido' },
    { regex: /REMUNERAÇÃOMES\s+([\d\.,]+)/i, label: 'Remuneração do Mês' },
    { regex: /DIAS\/HORASTRAB\s+([\d\.,]+)/i, label: 'Dias/Horas Trabalhados' },
  ];

  // Regex para "código label" em um único item: ex "91 Hr Adic Pericul", "40 Reembolso VR"
  const CODE_LABEL_REGEX = /^(\d{1,4})\s+([A-Za-zÀ-ÿ].{1,40})$/;
  // Regex para valor monetário: "290,92", "1.620,65", "0,00"
  const MONEY_REGEX = /^-?[\d]+[\d\.,]*[\d]$/;

  // === Auto-detecta o split entre coluna A e coluna B ===
  // Items com padrão "código label" (começam com dígito + espaço + letra)
  const codeLabelItems = blockItems.filter(i => i.str && CODE_LABEL_REGEX.test(i.str.trim()));
  let splitX = 215; // default

  if (codeLabelItems.length >= 2) {
    const xValues = codeLabelItems.map(i => i.x).sort((a, b) => a - b);
    // Encontra o maior gap entre X's consecutivos = fronteira entre col A e col B
    let maxGap = 0;
    for (let i = 1; i < xValues.length; i++) {
      const gap = xValues[i] - xValues[i - 1];
      if (gap > maxGap) {
        maxGap = gap;
        splitX = (xValues[i - 1] + xValues[i]) / 2;
      }
    }
  }

  // Bases do rodapé ficam APENAS à direita (X alto): BASEDECALCULO*, VALORDO*, SALARIOL*
  // NÃO inclui TOT.RENDIMENTOS (col A) nem TOTALDESCONTOS (col B)
  const baseItems = blockItems.filter(i =>
    i.str && /^(BASEDECALCULO|VALORDOFGTS|VALORDOIR|SALARIOL)/i.test(i.str.trim())
  );
  const colCMin = baseItems.length > 0
    ? Math.min(...baseItems.map(i => i.x)) - 5
    : splitX + 200;


  // === Agrupa por Y ===
  const rowMap = new Map();
  blockItems.forEach(item => {
    if (!item.str || !item.str.trim()) return;
    const yBucket = Math.round(item.y / 4) * 4;
    if (!rowMap.has(yBucket)) rowMap.set(yBucket, []);
    rowMap.get(yBucket).push(item);
  });

  Array.from(rowMap.entries()).sort(([a], [b]) => a - b).forEach(([, rowItems]) => {
    const sorted = rowItems.sort((a, b) => a.x - b.x);
    const fullLine = sorted.map(i => i.str).join(' ').trim();

    // === Bases e totais (processa na linha inteira) ===
    for (const { regex, label } of BASE_PATTERNS) {
      const m = fullLine.match(regex);
      if (m) {
        const value = m[1].trim();
        if (label === 'Total Proventos') totals.totalAdditions = value;
        else if (label === 'Total Descontos') totals.totalDeductions = value;
        else if (label === 'Valor Líquido') totals.netValue = value;
        else if (!bases.some(b => b.label === label)) {
          bases.push({ label, value });
        }
      }
    }

    // === Verbas: detecta pelos items "código label" em cada coluna ===
    // Col A: items à esquerda de splitX
    // Col B: items entre splitX e colCMin
    for (const [xMin, xMax, colType] of [
      [0, splitX, 'provento'],
      [splitX, colCMin, 'desconto']
    ]) {
      const colItems = sorted.filter(i => i.x >= xMin && i.x < xMax);
      if (colItems.length === 0) continue;

      // Encontra o item "código label" nesta coluna
      const codeLabelItem = colItems.find(i => CODE_LABEL_REGEX.test(i.str.trim()));
      if (!codeLabelItem) continue;

      const clMatch = codeLabelItem.str.trim().match(CODE_LABEL_REGEX);
      if (!clMatch) continue;

      const code = clMatch[1].trim();
      const rawLabel = clMatch[2].trim();

      // Filtra cabeçalhos e labels de rodapé
      if (/^(TOT|TOTAL|BASE|VALOR|DIAS|HORAS|REM|SAL|CNPJ|EMP|CARGO|MÊS|FOLHA)/i.test(rawLabel)) continue;
      if (rawLabel.length < 2) continue;

      // Os demais items numéricos nesta coluna são: [ref, valor] ou só [valor]
      const numItems = colItems
        .filter(i => i !== codeLabelItem && MONEY_REGEX.test(i.str.trim()))
        .sort((a, b) => a.x - b.x);

      let reference = '';
      let value = '';

      if (numItems.length === 1) {
        value = numItems[0].str.trim();
      } else if (numItems.length >= 2) {
        reference = numItems[0].str.trim();
        value = numItems[numItems.length - 1].str.trim();
      }

      if (!value) continue;

      const key = `${code}-${rawLabel.toLowerCase()}`;
      if (!seenFieldKeys.has(key)) {
        seenFieldKeys.add(key);
        fields.push({ code, label: rawLabel, reference, value, type: colType });
      }
    }
  });

  return { fields, bases, totals };
}


