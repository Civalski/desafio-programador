import { PDFExtract } from 'pdf.js-extract';
import fs from 'fs';

const pdfExtract = new PDFExtract();

/**
 * Extrai verbas e totais diretamente das camadas de texto do PDF de holerite com altíssima precisão.
 * @param {string} filePath 
 * @returns {Promise<Object>} Estrutura { pages: [ { page, month, year, fields: [...], bases: [...] } ] }
 */
export async function extractPayrollLocalPdf(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const pages = [];

  data.pages.forEach((page, pageIdx) => {
    const items = page.content;
    const lineGroups = [];

    // Agrupa texto por coordenadas Y (tolerância vertical de 4 unidades)
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

    const fields = [];
    const bases = [];
    const seenFields = new Set();

    lineGroups.forEach(g => {
      g.items.sort((a, b) => a.x - b.x);
      const lineStr = g.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!lineStr) return;

      // Procura competência (mês/ano)
      const matchComp = lineStr.match(/(?:Mês\/Ano|Mês|Período|Competência):\s*([a-z]{3}|\d{1,2})[\/\.-](\d{2,4})/i);
      if (matchComp) {
        const rawM = matchComp[1].toLowerCase();
        const monthMap = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
        month = monthMap[rawM] || (rawM.length === 1 ? `0${rawM}` : rawM);
        let rawY = matchComp[2];
        if (rawY.length === 2) rawY = `20${rawY}`;
        year = rawY;
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
      // Exemplo A: "40 Reembolso VR 0,00 360,00" -> ref: 0,00, val: 360,00
      // Exemplo B: "40 Reembolso VR 360,00" -> ref: "", val: 360,00
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

        // Evita cabeçalhos e termos genéricos
        if (code.match(/^(REM|DIAS|COD|TOT)$/i) || label.match(/^(DIAS|HORAS|REMUNERAÇÃO|BASE|VALOR|TOTAL)/i)) continue;
        if (label.length < 2) continue;

        const key = `${code}-${label}-${value}`;
        if (!seenFields.has(key)) {
          seenFields.add(key);
          fields.push({ code, label, reference, value });
        }
      }
    });

    pages.push({
      page: pageIdx + 1,
      month: month || '04',
      year: year || '2017',
      fields,
      bases
    });
  });

  return { pages };
}
