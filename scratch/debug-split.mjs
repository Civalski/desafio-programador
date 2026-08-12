import { PDFExtract } from 'pdf.js-extract';
import { segmentAllMonthBlocks } from '../src/utils/fichaFinanceiraSegmenter.js';

const pdfExtract = new PDFExtract();

async function debugSplit() {
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const blocks = segmentAllMonthBlocks(data.pages);
  const b1 = blocks[0]; // abr-17

  // Simula o que extractBlockDataLocal faz internamente
  const CODE_LABEL_REGEX = /^(\d{1,4})\s+([A-Za-zÀ-ÿ].{1,40})$/;
  
  const codeLabelItems = b1.items.filter(i => i.str && CODE_LABEL_REGEX.test(i.str.trim()));
  console.log('=== ITEMS QUE PASSAM NO CODE_LABEL_REGEX ===');
  codeLabelItems.forEach(i => {
    console.log(`  X=${i.x.toFixed(1).padStart(7)}: "${i.str}"`);
  });

  const xValues = codeLabelItems.map(i => i.x).sort((a, b) => a - b);
  console.log('\nX values dos code-label items:', xValues.map(x => x.toFixed(1)));

  let maxGap = 0;
  let splitX = 215;
  for (let i = 1; i < xValues.length; i++) {
    const gap = xValues[i] - xValues[i-1];
    if (gap > maxGap) { maxGap = gap; splitX = (xValues[i-1] + xValues[i]) / 2; }
  }
  console.log(`\nMaior gap: ${maxGap.toFixed(1)} → splitX: ${splitX.toFixed(1)}`);

  // Items de base
  const baseItems = b1.items.filter(i =>
    i.str && /^(BASEDECALCULO|VALORDOFGTS|VALORDOIR|SALARIOL|TOTALDES|TOT\.?REND)/i.test(i.str.trim())
  );
  console.log('\nItems de base e seus X:');
  baseItems.forEach(i => console.log(`  X=${i.x.toFixed(1)}: "${i.str}"`));
  const colCMin = baseItems.length > 0 ? Math.min(...baseItems.map(i => i.x)) - 5 : 400;
  console.log(`colCMin: ${colCMin.toFixed(1)}`);
  console.log(`\nEsperado: splitX~135, colCMin~415`);
  console.log(`\nCol A: X 0-${splitX.toFixed(1)} (proventos)`);
  console.log(`Col B: X ${splitX.toFixed(1)}-${colCMin.toFixed(1)} (descontos)`);
  console.log(`Col C: X ${colCMin.toFixed(1)}+ (bases)`);
}

debugSplit().catch(console.error);
