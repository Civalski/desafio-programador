import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

async function findJan() {
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log('=== BUSCANDO TUDO QUE CONTÉM "jan" OU "01/" NO PDF ===\n');

  data.pages.forEach((page, pageIdx) => {
    const items = page.content || [];
    
    // Group by Y
    const linesMap = new Map();
    items.forEach(item => {
      if (!item.str.trim()) return;
      const yBucket = Math.round(item.y / 4) * 4;
      if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
      linesMap.get(yBucket).push(item);
    });

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
    sortedY.forEach(y => {
      const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
      const lineStr = lineItems.map(i => i.str).join(' ').trim();
      if (/jan|01[\/-]|janeiro/i.test(lineStr)) {
        console.log(`Pág ${pageIdx + 1} | Y=${y.toFixed(0)}: "${lineStr}"`);
      }
    });
  });
}

findJan().catch(console.error);
