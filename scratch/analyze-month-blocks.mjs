import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

async function analyzeMonthBlocks() {
  const filePath = 'tmp/097142f1_payroll-01.pdf';
  
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });

  console.log('=== ANÁLISE DE BLOCOS DE MESES POR PÁGINA ===\n');

  // Regex para detectar linha de mês
  const MES_REGEX = /^Mês\s*:\s*([a-z]{3,9}[\s\-]?\d{2,4})$/i;
  const TOTAL_DESC_REGEX = /^TOTALDESCONTOS/i;

  const monthMap = {
    jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
    jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
  };

  let grandTotal = 0;

  data.pages.forEach((page, pageIdx) => {
    const items = page.content || [];
    
    // Agrupa por Y
    const linesMap = new Map();
    items.forEach(item => {
      if (!item.str.trim()) return;
      const yBucket = Math.round(item.y / 3) * 3;
      if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
      linesMap.get(yBucket).push(item);
    });

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const lines = sortedY.map(y => ({
      y,
      text: linesMap.get(y).sort((a, b) => a.x - b.x).map(i => i.str).join(' ').trim()
    })).filter(l => l.text);

    // Encontra linhas "Mês: xxx-YY"
    const monthLines = [];
    lines.forEach(l => {
      const m = l.text.match(/^Mês\s*:\s*([a-z]{3,9})[\s\-](\d{2,4})$/i);
      if (m) {
        const mesAbrev = m[1].toLowerCase();
        const anoRaw = m[2];
        const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
        const mes = monthMap[mesAbrev] || '??';
        monthLines.push({ y: l.y, text: l.text, competency: `${mes}/${ano}` });
      }
    });

    // Encontra linhas de TOTAL DESCONTOS (fim de cada bloco mensal)
    const totalLines = lines.filter(l => TOTAL_DESC_REGEX.test(l.text));

    console.log(`Página ${pageIdx + 1}: ${monthLines.length} meses encontrados`);
    monthLines.forEach((ml, idx) => {
      const nextMes = monthLines[idx + 1];
      const endTotLine = totalLines.find(t => t.y > ml.y && (!nextMes || t.y < nextMes.y));
      const verbCount = lines.filter(l => {
        return l.y > ml.y && l.y < (endTotLine ? endTotLine.y + 10 : (nextMes ? nextMes.y : Infinity));
      }).length;
      console.log(`  [${idx + 1}] Y=${ml.y} → Competência: ${ml.competency} | texto: "${ml.text}" | linhas no bloco: ~${verbCount}`);
    });
    
    grandTotal += monthLines.length;
    console.log('');
  });

  console.log(`=== TOTAL DE MESES NO DOCUMENTO: ${grandTotal} ===`);
}

analyzeMonthBlocks().catch(console.error);
