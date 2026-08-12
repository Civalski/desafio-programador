import { PDFExtract } from 'pdf.js-extract';
import { segmentAllMonthBlocks } from '../src/utils/fichaFinanceiraSegmenter.js';

const pdfExtract = new PDFExtract();

async function debugItems() {
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const blocks = segmentAllMonthBlocks(data.pages);
  const b1 = blocks[0]; // abr-17

  console.log('=== ITEMS BRUTOS DO BLOCO 1 (abr-17) — por Y e X ===\n');

  const rowMap = new Map();
  b1.items.forEach(item => {
    if (!item.str.trim()) return;
    const yBucket = Math.round(item.y / 4) * 4;
    if (!rowMap.has(yBucket)) rowMap.set(yBucket, []);
    rowMap.get(yBucket).push(item);
  });

  Array.from(rowMap.entries()).sort(([a],[b]) => a - b).forEach(([y, items]) => {
    const sorted = items.sort((a,b) => a.x - b.x);
    console.log(`Y=${y.toFixed(0).padStart(4)}:`);
    sorted.forEach(i => {
      console.log(`  X=${i.x.toFixed(1).padStart(7)}: "${i.str}"`);
    });
  });
}

debugItems().catch(console.error);
