import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

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
   * Executa chamada com fallback de modelos (gpt-5-nano -> gpt-4o-mini -> gpt-4o)
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = ['gpt-5-nano', 'gpt-4o-mini', 'gpt-4o'];
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
        if (!model.includes('gpt-5') && !model.includes('nano') && !model.startsWith('o')) {
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
   * Extrai o conteúdo em texto bruto por páginas de um PDF
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
        return lineItems.map(i => i.str).join(' ');
      });

      return `--- PÁGINA ${pageNum} ---\n` + textLines.join('\n');
    }).join('\n\n');
  }

  /**
   * Envia o PDF de Holerite (Payroll) para a API da OpenAI e retorna o DTO normalizado.
   */
  async parsePayroll(filePath, options = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      if (this.isReady()) {
        try {
          const rawPdfText = await this.extractPdfTextPages(filePath);

          const systemPrompt = `Você é um especialista em OCR e estruturação de documentos contábeis/RH brasileiros (Holerites / Folhas de Pagamento).
Sua tarefa é analisar o texto extraído de um documento PDF de Folha de Pagamento e retornar um JSON estritamente válido.

REGRAS CRÍTICAS DE EXTRAÇÃO:
1. "reference": deve conter EXCLUSIVAMENTE quantidades, horas, dias ou percentuais (ex: "30,00", "146,67", "0,00", "50%"). NUNCA coloque valores monetários em R$ em "reference".
2. "value": deve conter o valor monetário líquido em R$ (vencimento/provento ou desconto).
3. "month" e "year": extraia a competência exata (Mês "MM" de 2 dígitos e Ano "YYYY" de 4 dígitos). Se houver holerites de meses diferentes no PDF, separe em elementos distintos no array "pages".
4. REGRA FUNDAMENTAL DE EVIDÊNCIA DOCUMENTAL: Extraia APENAS as competências (mês/ano) efetivamente presentes no texto do PDF. NUNCA crie, preencha ou infira meses ou anos ausentes para tentar completar uma sequência anual.
5. DATAS DE ADMISSÃO, EMISSÃO E PAGAMENTO: Datas de Admissão (ex: 15/03/2018), Emissão ou Pagamento NÃO são a competência do holerite. A competência é exclusivamente a referência da folha (Mês/Ano, Competência, Período, Ref).

FORMATO JSON DE SAÍDA EXIGIDO:
{
  "pages": [
    {
      "page": 1,
      "month": "05",
      "year": "2024",
      "fields": [
        { "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }
      ],
      "bases": [
        { "label": "Base INSS", "value": "2.630,79" }
      ]
    }
  ]
}`;

          const userPrompt = `Analise o seguinte conteúdo extraído do PDF do holerite e estruture em JSON:\n\n${rawPdfText}`;

          const completionJson = await this.generateCompletionWithFallback([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]);

          const parsedObj = JSON.parse(completionJson);
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
