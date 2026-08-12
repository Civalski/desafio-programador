import OpenAI from 'openai';
import dotenv from 'dotenv';
import { PDFExtract } from 'pdf.js-extract';
dotenv.config();

const key = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: key });
const pdfExtract = new PDFExtract();

async function run() {
  console.log('Extraindo PDF por páginas para não omitir nenhuma informação...');
  const pdfRes = await new Promise(r => pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (_, res) => r(res)));

  const extractedPages = [];
  const totalPages = pdfRes.pages.length;
  console.log(`PDF possui ${totalPages} páginas. Processando página por página com OpenAI...`);

  // Processa as primeiras 3 páginas individualmente como teste
  for (let idx = 0; idx < Math.min(3, totalPages); idx++) {
    const pageObj = pdfRes.pages[idx];
    const pageNum = idx + 1;

    const linesMap = new Map();
    (pageObj.content || []).forEach(item => {
      if (!item.str.trim()) return;
      const yBucket = Math.round(item.y / 4) * 4;
      if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
      linesMap.get(yBucket).push(item);
    });

    const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const pageText = sortedY.map(y => {
      const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
      let lineStr = '';
      for (let i = 0; i < lineItems.length; i++) {
        if (i > 0) {
          const prev = lineItems[i - 1];
          const curr = lineItems[i];
          const gap = curr.x - (prev.x + (prev.width || 0));
          lineStr += gap > 15 ? '  |  ' : ' ';
        }
        lineStr += lineItems[i].str;
      }
      return lineStr;
    }).join('\n');

    const prompt = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites).
Analise com atenção MÁXIMA o texto desta Página ${pageNum}.
Existem verbas em colunas paralelas (Proventos à esquerda e Descontos à direita).
Extraia SEM OMITIR NENHUMA verba ou base.

Formato JSON estrito:
{
  "page": ${pageNum},
  "month": "MM",
  "year": "YYYY",
  "fields": [
    { "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }
  ],
  "bases": [
    { "label": "Base INSS", "value": "1.260,65" }
  ]
}`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: pageText }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    console.log(`✅ Página ${pageNum} extraída: Mês/Ano: ${parsed.month}/${parsed.year} - Verbas encontradas: ${parsed.fields?.length || 0}`);
    extractedPages.push(parsed);
  }

  console.log('\n--- RESUMO DE VERBAS EXTRAÍDAS DAS PÁGINAS ---');
  extractedPages.forEach(p => {
    console.log(`Pág ${p.page} (${p.month}/${p.year}):`, p.fields.map(f => `${f.code} - ${f.label}: ${f.value}`));
  });
}
run();
