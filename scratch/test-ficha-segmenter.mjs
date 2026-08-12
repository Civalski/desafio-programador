import { PDFExtract } from 'pdf.js-extract';
import { detectFichaFinanceira, segmentAllMonthBlocks, extractBlockDataLocal } from '../src/utils/fichaFinanceiraSegmenter.js';

const pdfExtract = new PDFExtract();

async function testSegmenter() {
  const filePath = 'tmp/097142f1_payroll-01.pdf';
  
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  const isFichaFinanceira = detectFichaFinanceira(data.pages);
  console.log(`É Ficha Financeira: ${isFichaFinanceira}\n`);

  const blocks = segmentAllMonthBlocks(data.pages);
  console.log(`Total de blocos mensais: ${blocks.length}\n`);

  // === Diagnóstico de coordenadas X do bloco 1 ===
  const b1 = blocks[0];
  console.log('=== DISTRIBUIÇÃO DE COORDENADAS X (Bloco 1: abr-17) ===');
  const xGroups = {};
  b1.items.forEach(item => {
    if (!item.str.trim()) return;
    const xBucket = Math.round(item.x / 50) * 50;
    if (!xGroups[xBucket]) xGroups[xBucket] = [];
    xGroups[xBucket].push(item.str);
  });
  Object.keys(xGroups).sort((a,b) => +a - +b).forEach(x => {
    console.log(`  X~${x}: ${xGroups[x].slice(0, 5).join(' | ')}`);
  });

  console.log('\n=== EXTRAÇÃO LOCAL POR BLOCO ===');
  let totalFields = 0;
  blocks.forEach((block, idx) => {
    const localData = extractBlockDataLocal(block.items);
    totalFields += localData.fields.length;
    const ok = localData.fields.length > 0 ? '✅' : '⚠️ ';
    console.log(`${ok} [${idx + 1}] ${block.month}/${block.year} | Fields: ${localData.fields.length} | Bases: ${localData.bases.length} | Líquido: ${localData.totals.netValue || 'N/A'}`);
    if (localData.fields.length > 0) {
      localData.fields.slice(0, 3).forEach(f => {
        console.log(`      [${f.code}] ${f.label} (${f.type}) ref:${f.reference} val:${f.value}`);
      });
    }
  });
  console.log(`\nTotal de fields extraídos: ${totalFields} em ${blocks.length} blocos`);
}

testSegmenter().catch(console.error);
