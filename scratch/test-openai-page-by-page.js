import OpenAI from 'openai';
import dotenv from 'dotenv';
import { PDFExtract } from 'pdf.js-extract';
dotenv.config();

const key = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: key });
const pdfExtract = new PDFExtract();

const PROMPT_IDENTIFICATION = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites).
Analise o texto desta página e extraia APENAS a identificação (cabeçalho).

Formato JSON estrito:
{
  "company": {
    "name": "Nome da Empresa",
    "cnpj": "CNPJ",
    "branch": "Filial"
  },
  "employee": {
    "name": "Nome do Funcionário",
    "cpf": "CPF",
    "registration": "Matrícula/Registro",
    "role": "Cargo",
    "department": "Departamento",
    "admissionDate": "DD/MM/YYYY"
  },
  "bankInfo": {
    "bank": "Banco",
    "agency": "Agência",
    "account": "Conta"
  },
  "competency": {
    "month": "MM",
    "year": "YYYY",
    "paymentDate": "DD/MM/YYYY"
  }
}`;

const PROMPT_ITEMS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites).
Analise o texto desta página e extraia APENAS as VERBAS da tabela principal (Proventos e Descontos).
Não extraia totais de rodapé nem dados de cabeçalho.
Extraia SEM OMITIR NENHUMA verba (por exemplo: Vale Transporte, Adiantamentos, Faltas, Horas Extras, Salário Base).
"reference" deve ser a quantidade, horas ou percentual. "value" deve ser o valor monetário em reais.

Formato JSON estrito:
{
  "fields": [
    { "code": "Código", "label": "Descrição da Verba", "reference": "Qtd/Ref", "value": "Valor R$" }
  ]
}`;

const PROMPT_TOTALS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites).
Analise o texto desta página e extraia APENAS os TOTAIS, BASES DE CÁLCULO e ENCARGOS (normalmente no rodapé).

Formato JSON estrito:
{
  "totals": {
    "totalAdditions": "Total de Proventos/Vencimentos R$",
    "totalDeductions": "Total de Descontos R$",
    "netValue": "Valor Líquido R$"
  },
  "bases": [
    { "label": "Ex: Base INSS", "value": "Valor R$" },
    { "label": "Ex: Base FGTS", "value": "Valor R$" },
    { "label": "Ex: FGTS do Mês", "value": "Valor R$" },
    { "label": "Ex: Base IRRF", "value": "Valor R$" },
    { "label": "Ex: Salário Base", "value": "Valor R$" }
  ]
}`;

async function runPrompt(prompt, pageText, pageNum, promptName) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: pageText }
      ]
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (error) {
    console.error(`Erro no prompt ${promptName} da página ${pageNum}:`, error.message);
    return {};
  }
}

async function run() {
  console.log('Extraindo PDF por páginas para não omitir nenhuma informação...');
  const pdfRes = await new Promise(r => pdfExtract.extract('tmp/097142f1_payroll-01.pdf', {}, (_, res) => r(res)));

  const extractedPages = [];
  const totalPages = pdfRes.pages.length;
  console.log(`PDF possui ${totalPages} páginas. Processando página por página com OpenAI...`);

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

    console.log(`Iniciando extração Multi-Prompt para Página ${pageNum}...`);
    
    // Executa as 3 chamadas em paralelo
    const [identData, itemsData, totalsData] = await Promise.all([
      runPrompt(PROMPT_IDENTIFICATION, pageText, pageNum, "Identificação"),
      runPrompt(PROMPT_ITEMS, pageText, pageNum, "Verbas"),
      runPrompt(PROMPT_TOTALS, pageText, pageNum, "Totais e Bases")
    ]);

    const mergedData = {
      page: pageNum,
      ...identData,
      ...itemsData,
      ...totalsData
    };

    console.log(`✅ Página ${pageNum} extraída: Mês/Ano: ${mergedData.competency?.month}/${mergedData.competency?.year} - Verbas: ${mergedData.fields?.length || 0}`);
    extractedPages.push(mergedData);
  }

  console.log('\n--- RESUMO DA EXTRAÇÃO MULTI-PROMPT ---');
  extractedPages.forEach(p => {
    console.log(`\n=== Pág ${p.page} (${p.competency?.month}/${p.competency?.year}) ===`);
    console.log(`Funcionário: ${p.employee?.name} (Cargo: ${p.role})`);
    console.log(`Data Pagamento: ${p.competency?.paymentDate} | Conta: ${p.bankInfo?.bank} ${p.bankInfo?.account}`);
    console.log(`Verbas (${p.fields?.length}):`);
    (p.fields || []).forEach(f => console.log(`  [${f.code || 'S/N'}] ${f.label} | Ref: ${f.reference} | R$ ${f.value}`));
    console.log(`Totais: Liq: R$ ${p.totals?.netValue} | Prov: R$ ${p.totals?.totalAdditions} | Desc: R$ ${p.totals?.totalDeductions}`);
    console.log(`Bases:`);
    (p.bases || []).forEach(b => console.log(`  ${b.label}: R$ ${b.value}`));
  });
}

run();
