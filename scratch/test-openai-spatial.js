import OpenAI from 'openai';
import dotenv from 'dotenv';
import { PDFExtract } from 'pdf.js-extract';
dotenv.config();

const key = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: key });
const pdfExtract = new PDFExtract();

async function run() {
  const pdfRes = await new Promise(r => pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (_, res) => r(res)));
  const p1 = pdfRes.pages[0];
  const linesMap = new Map();
  (p1.content || []).forEach(item => {
    if (!item.str.trim()) return;
    const yBucket = Math.round(item.y / 4) * 4;
    if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
    linesMap.get(yBucket).push(item);
  });
  const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
  const formattedText = sortedY.map(y => {
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

  console.log('Sending formatted spatial text to gpt-4o-mini...');
  const start = Date.now();
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Você é um especialista em extração de Holerites/Folha de Pagamento em PDF.
O texto recebido possui colunas de tabelas separadas visualmente pelo caractere ' | '.
Atenção: Existem verbas em colunas paralelas (Proventos e Descontos). Extraia TODAS as verbas (código, nome, referência e valor R$) de cada mês.
Retorne um JSON no formato:
{
  "pages": [
    {
      "page": 1,
      "month": "MM",
      "year": "YYYY",
      "fields": [
        { "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" },
        { "code": "499", "label": "Vale Ref Func", "reference": "0", "value": "36,00" }
      ],
      "bases": [
        { "label": "Base INSS", "value": "1.260,65" }
      ]
    }
  ]
}`
      },
      { role: 'user', content: formattedText }
    ]
  });

  const duration = (Date.now() - start) / 1000;
  console.log('⚡ OpenAI respondeu em:', duration, 'segundos!');
  const json = JSON.parse(res.choices[0].message.content);
  console.log('Páginas Extraídas:', json.pages?.length);
  if (json.pages?.[0]) {
    console.log('Mês/Ano Pág 1:', json.pages[0].month, '/', json.pages[0].year);
    console.log('Total de Verbas Pág 1:', json.pages[0].fields?.length);
    console.table(json.pages[0].fields);
  }
}
run();
