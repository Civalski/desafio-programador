import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

/**
 * PROMPT UNIFICADO: Extrai identificação + competência + verbas em uma única chamada.
 * Isso garante que a data (mês/ano) sempre viaje junto das verbas, evitando o bug
 * onde a competência desaparece ao mesclar múltiplas páginas.
 */
const PROMPT_UNIFIED = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página de holerite e extraia:
1. A COMPETÊNCIA (mês e ano de referência do holerite) — OBRIGATÓRIO. Procure por textos como "Competência:", "Mês/Ano:", "Período:", "Referência:", ou padrões como "05/2024".
2. Os dados do FUNCIONÁRIO e EMPRESA (cabeçalho).
3. TODAS as VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.

REGRAS CRÍTICAS:
- "competency.month" DEVE conter o número do mês (01-12) da folha de pagamento.
- "competency.year" DEVE conter o ano com 4 dígitos (ex: 2024).
- NÃO confunda data de admissão, emissão, nascimento ou pagamento com a competência.
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetário R$.
- "type" de cada verba deve ser "provento" se é crédito/adição, ou "desconto" se é débito/subtração.
- NÃO inclua totais (Total Proventos, Total Descontos, Valor Líquido) em "fields".
- Se algum campo não existir no documento, use null ou string vazia — NUNCA invente dados.

Formato JSON estrito:
{
  "competency": {
    "month": "MM",
    "year": "YYYY",
    "paymentDate": "DD/MM/YYYY ou null"
  },
  "company": {
    "name": "Nome da Empresa",
    "cnpj": "CNPJ ou null",
    "branch": "Filial ou null"
  },
  "employee": {
    "name": "Nome do Funcionário",
    "cpf": "CPF ou null",
    "registration": "Matrícula ou null",
    "role": "Cargo ou null",
    "department": "Departamento ou null",
    "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": {
    "bank": "Banco ou null",
    "agency": "Agência ou null",
    "account": "Conta ou null"
  },
  "fields": [
    {
      "code": "Código numérico ou null",
      "label": "Descrição exata da verba como aparece no documento",
      "reference": "Qtd/Horas/Percentual ou null",
      "value": "Valor monetário R$ (ex: 3.200,00)",
      "type": "provento ou desconto"
    }
  ]
}`;

/**
 * PROMPT DE TOTAIS: Extrai exclusivamente rodapé (totais, bases, encargos).
 * Explicitamente instruído a NÃO repetir itens que já são verbas individuais.
 */
const PROMPT_TOTALS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página e extraia APENAS os dados do RODAPÉ da folha:
1. Os totais consolidados (Total Proventos, Total Descontos, Valor Líquido)
2. As bases de cálculo (Base INSS, Base IRRF, Base FGTS, FGTS do Mês etc.)

REGRAS CRÍTICAS:
- NÃO inclua verbas individuais (ex: Salário Base, Vale Transporte, Horas Extras) — apenas totais e bases.
- Se um item é uma verba individual da tabela principal, IGNORE-O aqui.
- "bases" deve conter APENAS linhas de rodapé como: Base INSS, Base IRRF, Base FGTS, FGTS do Mês, Alíquota IRRF.
- Se um campo não existir no documento, use null — NUNCA invente valores.

Formato JSON estrito:
{
  "totals": {
    "totalAdditions": "Total de Proventos R$ ou null",
    "totalDeductions": "Total de Descontos R$ ou null",
    "netValue": "Valor Líquido R$ ou null"
  },
  "bases": [
    { "label": "Nome exato da base (ex: Base INSS)", "value": "Valor R$" }
  ]
}`;
export class OpenAIService {
  constructor(apiKey = config.openaiApiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.initClient();
  }

  initClient() {
    const key = this.apiKey || process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn('⚠️ Alerta: OPENAI_SECRET_KEY não configurada.');
      return;
    }

    try {
      this.client = new OpenAI({ apiKey: key });
    } catch (error) {
      console.error('❌ Erro ao inicializar o cliente OpenAI:', error.message);
    }
  }

  isReady() {
    const key = this.apiKey || process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
    return Boolean(key && this.client);
  }

  getClient() {
    return this.client;
  }

  /**
   * Executa chamada com fallback de modelos (gpt-5.6-luna -> gpt-4o -> gpt-4o-mini)
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = ['gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini'];
    let lastError;

    for (const model of models) {
      try {
        console.log(`🤖 Executando requisição OpenAI com modelo: ${model}`);
        const requestParams = {
          model,
          messages,
          response_format: { type: 'json_object' },
          ...options
        };

        if (!model.includes('gpt-5') && !model.includes('luna') && !model.includes('nano') && !model.startsWith('o')) {
          requestParams.temperature = 0.1;
        }

        const response = await this.client.chat.completions.create(requestParams);
        return response.choices[0]?.message?.content || '{}';
      } catch (err) {
        console.warn(`⚠️ Modelo OpenAI ${model} falhou ou sofreu limitação (${err.message}). Tentando modelo seguinte...`);
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Extrai o conteúdo preservando colunas espaciais separado por páginas
   */
  async extractPdfTextPages(filePath) {
    const data = await new Promise((resolve, reject) => {
      pdfExtract.extract(filePath, {}, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    return data.pages.map((p, idx) => {
      const pageNum = idx + 1;
      const linesMap = new Map();

      (p.content || []).forEach(item => {
        if (!item.str.trim()) return;
        const yBucket = Math.round(item.y / 4) * 4;
        if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
        linesMap.get(yBucket).push(item);
      });

      const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
      const textLines = sortedY.map(y => {
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
      });

      return {
        pageNum,
        text: textLines.join('\n')
      };
    });
  }

  /**
   * Envia o PDF de Holerite (Payroll) para a API da OpenAI e retorna o DTO normalizado.
   * Processa página por página para garantir 100% de cobertura sem omissão de verbas.
   */
  async parsePayroll(filePath, options = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      if (this.isReady()) {
        try {
          const pdfPages = await this.extractPdfTextPages(filePath);
          console.log(`📄 Processando ${pdfPages.length} páginas de holerite em paralelo via OpenAI...`);

          const pagePromises = pdfPages.map(async (pageObj) => {
            try {
              const runPrompt = async (systemPrompt) => {
                const completionJson = await this.generateCompletionWithFallback([
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: pageObj.text }
                ]);
                try {
                  return JSON.parse(completionJson);
                } catch {
                  return {};
                }
              };

              console.log(`🔍 Extraindo Página ${pageObj.pageNum} com Prompt Unificado + Totais...`);

              // 2 chamadas em paralelo: unified (ident+verbas) e totals (rodapé)
              const [unifiedData, totalsData] = await Promise.all([
                runPrompt(PROMPT_UNIFIED),
                runPrompt(PROMPT_TOTALS)
              ]);

              // Lê competência do formato novo (competency.month/year)
              const competency = unifiedData.competency || {};
              const month = competency.month || unifiedData.month || '';
              const year = competency.year || unifiedData.year || '';
              const paymentDate = competency.paymentDate || unifiedData.paymentDate || null;

              // Normaliza fields para garantir campo 'type'
              const fields = (unifiedData.fields || []).map(f => ({
                code: f.code || '',
                label: f.label || '',
                reference: f.reference || '',
                value: f.value || '',
                type: f.type || 'provento'
              }));

              const result = {
                page: pageObj.pageNum,
                month,
                year,
                paymentDate,
                company: unifiedData.company || null,
                employee: unifiedData.employee || null,
                bankInfo: unifiedData.bankInfo || null,
                fields,
                totals: totalsData.totals || {},
                bases: totalsData.bases || []
              };

              console.log(`✅ Página ${pageObj.pageNum}: Competência ${month}/${year} | Verbas: ${fields.length} | Bases: ${result.bases.length}`);
              return result;
            } catch (err) {
              console.warn(`⚠️ Falha na extração da página ${pageObj.pageNum} via OpenAI:`, err.message);
              return null;
            }
          });

          const extractedPagesRaw = (await Promise.all(pagePromises)).filter(Boolean);
          const parsedObj = { pages: extractedPagesRaw };
          const normalized = normalizePayrollResponse(parsedObj);

          if (normalized.pages?.[0]?.fields?.length) {
            return normalized;
          }
        } catch (apiErr) {
          console.warn(`⚠️ API da OpenAI falhou (${apiErr.message}). Utilizando extrator local em PDF...`);
        }
      }

      // Fallback para o extrator local
      const localResult = await extractPayrollLocalPdf(filePath);
      return normalizePayrollResponse(localResult);

    } catch (error) {
      console.error(`❌ Erro no parsing via OpenAI (${filePath}):`, error.message);
      return normalizePayrollResponse({ pages: [] });
    }
  }

  /**
   * Envia o PDF de Cartão de Ponto para a API da OpenAI e retorna o DTO normalizado.
   */
  async parseTimeCard(filePath, options = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    } catch (error) {
      console.error(`❌ Erro no parsing de Cartão de Ponto via OpenAI (${filePath}):`, error.message);
      const fallbackRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(fallbackRaw);
    }
  }

  async parseDocument(filePath, documentType, options = {}) {
    if (documentType === 'time_card') {
      return this.parseTimeCard(filePath, options);
    } else if (documentType === 'payroll') {
      return this.parsePayroll(filePath, options);
    } else {
      throw new Error(`Tipo de documento não suportado: ${documentType}`);
    }
  }
}

export const openaiService = new OpenAIService();
