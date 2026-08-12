import { PDFExtract } from 'pdf.js-extract';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs';
import { 
  segmentPagePayslips, 
  evaluateHoleriteComplexity, 
  splitRegionHorizontally 
} from './payslipSegmenter.js';
import { mergeFields, mergeBases } from './horizontalMerger.js';
import { detectFichaFinanceira, segmentAllMonthBlocks, extractBlockDataLocal } from './fichaFinanceiraSegmenter.js';

const pdfExtract = new PDFExtract();

/**
 * Rasteriza páginas escaneadas em um processo isolado. pdf.js-extract já traz
 * pdf.js 5.5, enquanto pdf-to-img usa 5.4; isolá-los evita o conflito de worker
 * que ocorria ao converter depois de extrair a camada de texto.
 */
export async function rasterizePdfPages(filePath, pageNumbers, options = {}) {
  if (!pageNumbers.length) return new Map();

  try {
    const workerSource = `
      import { pdf } from 'pdf-to-img';
      const [filePath, pageNumbersJson, scale] = process.argv.slice(1);
      const document = await pdf(filePath, { scale: Number(scale) });
      const pages = JSON.parse(pageNumbersJson);
      const output = [];
      for (const pageNumber of pages) {
        const image = await document.getPage(pageNumber);
        if (!image) throw new Error('Page not rendered: ' + pageNumber);
        output.push([pageNumber, Buffer.from(image).toString('base64')]);
      }
      process.stdout.write(JSON.stringify(output));
    `;
    const runNode = promisify(execFile);
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module', '--eval', workerSource, filePath,
      JSON.stringify(pageNumbers), String(options.scale ?? 4)
    ], { 
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: options.maxBuffer ?? 100 * 1024 * 1024 
    });

    return new Map(JSON.parse(stdout).map(([pageNumber, base64]) => [pageNumber, {
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${base64}`
    }]));
  } catch (subErr) {
    console.warn(`⚠️ Rasterização via sub-processo falhou (${subErr.message}). Tentando rasterização em processo...`);
    try {
      const { pdf } = await import('pdf-to-img');
      const document = await pdf(filePath, { scale: Number(options.scale ?? 4) });
      const outputMap = new Map();
      for (const pageNumber of pageNumbers) {
        const image = await document.getPage(pageNumber);
        if (image) {
          const base64 = Buffer.from(image).toString('base64');
          outputMap.set(pageNumber, {
            mimeType: 'image/png',
            dataUrl: `data:image/png;base64,${base64}`
          });
        }
      }
      return outputMap;
    } catch (inProcErr) {
      console.error(`❌ Falha na rasterização em processo do PDF (${filePath}):`, inProcErr.message);
      throw new Error(`Falha ao rasterizar páginas do PDF de imagem: ${inProcErr.message}`);
    }
  }
}
/**
 * Extrai competência (mês e ano) de uma linha de texto com alta precisão e sem falsos positivos.
 * @param {string} lineStr 
 * @returns {{ rawM: string, rawY: string, isExplicit: boolean } | null}
 */
function parseCompetencyFromLine(lineStr) {
  if (!lineStr || typeof lineStr !== 'string') return null;

  // 1. Keyword explícita de competência (maior precedência)
  const kwMatch = lineStr.match(/(?:Mês\s*[\/\.-]\s*Ano|Mês|Período|Competência|Comp|Folha(?:\s+de\s+Pagamento)?|Ref(?:erência)?)\s*:?\s*([a-z]{3,9}|\d{1,2})\s*[\/\.-]\s*(\d{2,4})/i);
  if (kwMatch) {
    return { rawM: kwMatch[1], rawY: kwMatch[2], isExplicit: true };
  }

  // Desfazer falsos positivos com datas que NÃO são competência (ex: Data de Admissão, Emissão, Nascimento, Impressão, Pagamento, CTPS, RG, CPF)
  if (/admiss[ãa]o|emiss[ãa]o|nasciment|impress[ãa]o|pagamento|processamento|c\.?t\.?p\.?s|rg|cpf/i.test(lineStr)) {
    return null;
  }

  // 2. Mês por extenso / sigla por extenso (ex: "Maio / 2024", "MAI/2024", "Junho - 2024")
  const monthNameMatch = lineStr.match(/\b(jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*[\/\.-]\s*((?:19|20)\d{2}|\d{2})\b/i);
  if (monthNameMatch) {
    return { rawM: monthNameMatch[1], rawY: monthNameMatch[2], isExplicit: true };
  }

  // 3. Padrão numérico MM/YYYY isolado que NÃO seja precedido por um dia (DD/)
  const numMatch = lineStr.match(/(?:^|[^\d/.-])\b(0[1-9]|1[0-2])\s*[\/\.-]\s*((?:19|20)\d{2}|\d{2})\b(?![/.-]\d)/i);
  if (numMatch) {
    const matchIndex = numMatch.index;
    const charBefore = lineStr.slice(Math.max(0, matchIndex - 3), matchIndex);
    if (/\d{1,2}\s*[\/\.-]\s*$/.test(charBefore)) {
      return null;
    }
    return { rawM: numMatch[1], rawY: numMatch[2], isExplicit: false };
  }

  return null;
}

/**
 * Extrai dados de um conjunto de itens de texto de uma região de holerite.
 * @param {Array<Object>} items 
 * @returns {{ month: string, year: string, fields: Array<Object>, bases: Array<Object> }}
 */
function extractRegionData(items = []) {
  const lineGroups = [];

  items.forEach(item => {
    if (!item.str.trim()) return;
    let group = lineGroups.find(g => Math.abs(g.y - item.y) < 4);
    if (!group) {
      group = { y: item.y, items: [] };
      lineGroups.push(group);
    }
    group.items.push(item);
  });

  lineGroups.sort((a, b) => a.y - b.y);

  let month = '';
  let year = '';
  let hasExplicitComp = false;

  const monthMap = { 
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
    dez: '12', dezembro: '12' 
  };

  const fields = [];
  const bases = [];
  const seenFields = new Set();

  lineGroups.forEach(g => {
    g.items.sort((a, b) => a.x - b.x);
    const lineStr = g.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!lineStr) return;

    // Procura competência (mês/ano) se ainda não travou em uma competência explícita
    if (!hasExplicitComp || !month) {
      const parsedComp = parseCompetencyFromLine(lineStr);
      if (parsedComp) {
        if (!hasExplicitComp || parsedComp.isExplicit) {
          const rawM = parsedComp.rawM.toLowerCase();
          month = monthMap[rawM] || (rawM.length === 1 ? `0${rawM}` : rawM);
          let rawY = parsedComp.rawY;
          if (rawY.length === 2) rawY = `20${rawY}`;
          year = rawY;
          if (parsedComp.isExplicit) {
            hasExplicitComp = true;
          }
        }
      }
    }

    // 1. Extração de Totais e Bases de Cálculo
    const baseRegex = /(Base\s*I?\.?N?\.?S?\.?S?\.?|Base\s*I?\.?R?\.?R?\.?F?\.?|Base\s*FGTS|Valor\s*do\s*FGTS|F\.?G\.?T\.?S\.?\s*do\s*Mês|Proventos\s*Bruto|Proventos\s*Líquidos|Total\s*Rendimentos|Total\s*Descontos|Salário\s*Líquido|Valor\s*Líquido|Líqüido)\s*:?\s*(-?[\d\.,]+)/gi;
    let baseMatch;
    while ((baseMatch = baseRegex.exec(lineStr)) !== null) {
      bases.push({
        label: baseMatch[1].trim(),
        value: baseMatch[2].trim()
      });
    }

    // 2. Extração de Verbas (Código, Nome, Referência, Valor)
    const verbaRegex = /\b(\d{1,4})\s+([A-Za-zÀ-ÿ0-9%/\-\.\s\(\)]+?)\s+([\d\.,%]+)(?:\s+(-?[\d\.,]+))?(?=\s+\d{1,4}|\s+BASE|\s+VALOR|\s+TOT|\s*$)/g;
    let vMatch;
    while ((vMatch = verbaRegex.exec(lineStr)) !== null) {
      const code = vMatch[1].trim();
      const label = vMatch[2].trim();
      let reference = '';
      let value = '';

      if (vMatch[4] !== undefined) {
        reference = vMatch[3].trim();
        value = vMatch[4].trim();
      } else {
        reference = '';
        value = vMatch[3].trim();
      }

      if (code.match(/^(REM|DIAS|COD|TOT)$/i) || label.match(/^(DIAS|HORAS|REMUNERAÇÃO|BASE|VALOR|TOTAL)/i)) continue;
      if (label.length < 2) continue;

      const key = `${code}-${label}-${value}`;
      if (!seenFields.has(key)) {
        seenFields.add(key);
        fields.push({ code, label, reference, value });
      }
    }
  });

  return { month, year, fields, bases };
}

/**
 * Extrai verbas e totais diretamente das camadas de texto do PDF de holerite com altíssima precisão.
 * @param {string} filePath 
 * @returns {Promise<Object>} Estrutura { pages: [ { page, month, year, fields: [...], bases: [...] } ] }
 */
export async function extractPayrollLocalPdf(filePath, options = {}) {
  const onProgress = options.onProgress || (() => {});
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  onProgress({ current: 0, total: 0, percentage: 10, message: 'Iniciando extração local do PDF...', log: '⚡ Iniciando OCR local das camadas de texto do PDF...' });

  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const totalPages = data.pages.length;
  const isFicha = detectFichaFinanceira(data.pages);

  if (isFicha) {
    const blocks = segmentAllMonthBlocks(data.pages);
    onProgress({ current: 0, total: blocks.length, percentage: 20, message: `Ficha Financeira: ${blocks.length} blocos mensais`, log: `📄 Ficha Financeira: ${blocks.length} blocos mensais encontrados.` });
    const pages = blocks.map((block, bIdx) => {
      const localData = extractBlockDataLocal(block.items);
      const pct = Math.min(95, Math.round(20 + ((bIdx + 1) / blocks.length) * 75));
      onProgress({
        current: bIdx + 1,
        total: blocks.length,
        percentage: pct,
        message: `Bloco ${bIdx + 1} de ${blocks.length} processado (${block.month}/${block.year})`,
        log: `✅ Bloco ${block.month}/${block.year}: ${localData.fields.length} verbas extraídas localmente.`
      });
      return {
        page: block.pageNum,
        month: block.month,
        year: block.year,
        fields: localData.fields,
        bases: localData.bases,
        totals: localData.totals
      };
    });
    return { pages };
  }

  const pages = [];

  data.pages.forEach((page, pageIdx) => {
    const rawItems = page.content || [];
    const pageMeta = page.pageInfo || { num: pageIdx + 1, height: 842, width: 595 };

    // 1. Etapa de Segmentação Automática dos Holerites dentro da página (Vertical)
    const regions = segmentPagePayslips(rawItems, pageMeta);

    regions.forEach((region) => {
      // 2. Etapa de Avaliação de Complexidade e Divisão Horizontal se necessário
      const comp = evaluateHoleriteComplexity(region.items);

      let finalMonth = '';
      let finalYear = '';
      let finalFields = [];
      let finalBases = [];
      let isHorizontalSplit = false;

      if (comp.isComplex) {
        // Divisão horizontal (Esquerda e Direita com overlap)
        const { leftRegion, rightRegion } = splitRegionHorizontally(region);
        const leftData = extractRegionData(leftRegion.items);
        const rightData = extractRegionData(rightRegion.items);

        finalMonth = leftData.month || rightData.month;
        finalYear = leftData.year || rightData.year;
        finalFields = mergeFields(leftData.fields, rightData.fields);
        finalBases = mergeBases(leftData.bases, rightData.bases);
        isHorizontalSplit = true;
      } else {
        // Extração normal para holerites simples
        const regionData = extractRegionData(region.items);
        finalMonth = regionData.month;
        finalYear = regionData.year;
        finalFields = regionData.fields;
        finalBases = regionData.bases;
      }

      // Evita adicionar regiões totalmente vazias em documentos multi-segmento
      if (regions.length > 1 && finalFields.length === 0 && finalBases.length === 0 && !finalMonth) {
        return;
      }

      pages.push({
        page: pageIdx + 1,
        index: region.index,
        yStart: region.yStart,
        yEnd: region.yEnd,
        month: finalMonth || '',
        year: finalYear || '',
        fields: finalFields,
        bases: finalBases,
        isHorizontalSplit
      });
    });

    const pct = Math.min(95, Math.round(15 + ((pageIdx + 1) / totalPages) * 80));
    onProgress({
      current: pageIdx + 1,
      total: totalPages,
      percentage: pct,
      message: `Página ${pageIdx + 1} de ${totalPages} processada localmente`,
      log: `✅ Página ${pageIdx + 1}/${totalPages} analisada via extrator local.`
    });
  });

  return { pages };
}


