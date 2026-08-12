import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

async function inspectDeep() {
  const filePath = 'tmp/097142f1_payroll-01.pdf';
  
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log(`=== INSPEÇÃO PROFUNDA: ${data.pages.length} páginas ===\n`);

  // Analisa a página 1 que tem o cabeçalho principal com o período
  const page1 = data.pages[0];
  const items1 = page1.content || [];

  // Coleta todos os textos únicos para entender a estrutura
  console.log('=== TODOS OS TEXTOS DA PÁGINA 1 (ordenados por Y) ===');
  const linesMap = new Map();
  items1.forEach(item => {
    if (!item.str.trim()) return;
    const yBucket = Math.round(item.y / 3) * 3;
    if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
    linesMap.get(yBucket).push(item);
  });

  const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
  sortedY.forEach(y => {
    const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
    const lineStr = lineItems.map(i => i.str).join(' ').trim();
    if (lineStr) {
      console.log(`  Y=${y.toFixed(0).padStart(4)}: "${lineStr}"`);
    }
  });

  console.log('\n\n=== PROCURA POR PADRÃO DE MÊS EM TODAS AS PÁGINAS ===');
  // Regex para detectar mês/ano no formato do documento
  const mesRegex = /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z\-]*[\s\-]?(\d{2})\b/gi;
  const mesRegex2 = /\bMês\s*:\s*([a-z]{3,9}[\s\-]?\d{2,4})\b/gi;
  const mesRegex3 = /\b(0[1-9]|1[0-2])\/(\d{4})\b/g;
  const periodoRegex = /PERIODO\s*:\s*([\d\/]+\s*a\s*[\d\/]+)/gi;

  data.pages.forEach((page, idx) => {
    const items = page.content || [];
    const allText = items.map(i => i.str).join(' ');
    
    const meses = [];
    let m;
    
    while ((m = mesRegex.exec(allText)) !== null) meses.push(m[0]);
    while ((m = mesRegex2.exec(allText)) !== null) meses.push(m[0]);
    while ((m = mesRegex3.exec(allText)) !== null) meses.push(m[0]);
    while ((m = periodoRegex.exec(allText)) !== null) meses.push('PERIODO: ' + m[1]);

    console.log(`Página ${idx + 1}: Meses encontrados (${meses.length}): ${[...new Set(meses)].join(', ')}`);
  });
}

inspectDeep().catch(console.error);
