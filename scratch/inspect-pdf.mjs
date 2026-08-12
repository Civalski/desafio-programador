import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

async function inspectPdf() {
  const filePath = 'tmp/097142f1_payroll-01.pdf';
  
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log('=== INSPEÇÃO DO PDF ===');
  console.log(`Total de páginas: ${data.pages.length}`);
  console.log('');

  // Mostra sumário de cada página: quantos itens de texto e as primeiras linhas
  data.pages.forEach((page, idx) => {
    const items = page.content || [];
    const pageInfo = page.pageInfo || {};
    
    // Agrupa itens por Y para extrair linhas
    const linesMap = new Map();
    items.forEach(item => {
      if (!item.str.trim()) return;
      const yBucket = Math.round(item.y / 4) * 4;
      if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
      linesMap.get(yBucket).push(item);
    });

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const lines = sortedY.map(y => {
      const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
      return lineItems.map(i => i.str).join(' ').trim();
    }).filter(l => l.length > 0);

    // Procura por linhas de competência
    const compLines = lines.filter(l => 
      /compet[eê]ncia|mês\s*\/?\s*ano|per[ií]odo|referência|ref\.|folha|holerite/i.test(l) ||
      /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[\s\/\.-]?\s*(19|20)\d{2}\b/i.test(l) ||
      /\b(0[1-9]|1[0-2])[\/\.-](19|20)\d{2}\b/.test(l)
    );

    console.log(`--- Página ${idx + 1} (${items.length} items, ${lines.length} linhas, w:${pageInfo.width?.toFixed(0)} h:${pageInfo.height?.toFixed(0)}) ---`);
    console.log('  Primeiras 5 linhas:');
    lines.slice(0, 5).forEach(l => console.log(`    "${l}"`));
    if (compLines.length > 0) {
      console.log('  *** Linhas com competência/período:');
      compLines.forEach(l => console.log(`    >>> "${l}"`));
    }
    console.log('');
  });
}

inspectPdf().catch(console.error);
