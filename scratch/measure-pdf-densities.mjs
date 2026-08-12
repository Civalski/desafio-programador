import fs from 'fs';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

async function inspectPdfs() {
  const dir = path.resolve('../data_input/payroll');
  if (!fs.existsSync(dir)) {
    console.log('Dir ../data_input/payroll not found');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
  for (const file of files) {
    const filePath = path.join(dir, file);
    const res = await new Promise(r => pdfExtract.extract(filePath, {}, (e, res) => r(res)));
    console.log(`\n=== ${file} (${res.pages.length} páginas) ===`);
    res.pages.forEach((p, i) => {
      const charCount = (p.content || []).reduce((acc, item) => acc + item.str.length, 0);
      const lineCount = (p.content || []).length;
      console.log(`  Página ${i + 1}: ${charCount} caracteres, ${lineCount} elementos de texto`);
    });
  }
}

inspectPdfs();
