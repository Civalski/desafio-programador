import { PDFExtract } from 'pdf.js-extract';
import { detectFichaFinanceira, segmentAllMonthBlocks } from '../src/utils/fichaFinanceiraSegmenter.js';

const pdfExtract = new PDFExtract();

async function testJanRegex() {
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const MES_MARKER_REGEX = /^Mês\s*:\s*([a-z]{3,9}[\s\-]\d{2,4})\b/i;

  console.log('=== TESTANDO BUSCA DE MARCADORES DE MÊS ===\n');

  let totalFound = 0;
  data.pages.forEach((page, idx) => {
    const pageNum = idx + 1;
    const items = page.content || [];

    const linesMap = new Map();
    items.forEach(item => {
      if (!item.str.trim()) return;
      const yBucket = Math.round(item.y / 4) * 4;
      if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
      linesMap.get(yBucket).push(item);
    });

    const monthLines = [];
    Array.from(linesMap.entries()).sort(([a],[b]) => a - b).forEach(([y, lineItems]) => {
      const sorted = lineItems.sort((a,b) => a.x - b.x);
      const text = sorted.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      const m = text.match(MES_MARKER_REGEX);
      if (m) {
        monthLines.push({ y, text, comp: m[1] });
      }
    });

    console.log(`Página ${pageNum}: ${monthLines.length} marcadores encontrados`);
    monthLines.forEach(ml => {
      console.log(`   --> ${ml.comp} | texto da linha: "${ml.text}"`);
    });
    totalFound += monthLines.length;
    console.log('');
  });

  console.log(`TOTAL DE MESES DETECTADOS NO DOCUMENTO INTEIRO: ${totalFound}`);
}

testJanRegex().catch(console.error);
