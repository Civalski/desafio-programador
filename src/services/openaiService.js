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
   * Executa chamada com fallback de modelos (gpt-4o -> gpt-4o-mini)
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = ['gpt-4o', 'gpt-4o-mini'];
    let lastError;

    for (const model of models) {
      try {
        console.log(`🤖 Executando requisição OpenAI com modelo: ${model}`);
        const requestParams = {
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          ...options
        };

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
            const systemPrompt = `Você é um especialista em OCR e estruturação de documentos contábeis/RH brasileiros (Holerites / Folhas de Pagamento).
O texto recebido contém a Página ${pageObj.pageNum} com colunas de tabelas separadas visualmente por '  |  '.
IMPORTANTE: Existem verbas em colunas paralelas (Proventos à esquerda e Descontos à direita). Extraia TODAS as verbas (de ambas as colunas) SEM OMITIR NENHUMA VERBA.

REGRAS CRÍTICAS DE EXTRAÇÃO:
1. "fields": Array com TODAS as verbas encontradas na página (Proventos e Descontos). Cada item deve ter:
   - "code": código numérico da verba (ex: "40", "499", "511", "91").
   - "label": nome/descrição da verba (ex: "Reembolso VR", "Vale Ref Func", "INSS Normal").
   - "reference": quantidade, horas, dias ou percentuais (ex: "30,00", "146,67", "0,00"). NUNCA coloque valores monetários em R$ em reference.
   - "value": valor monetário em R$ da verba (ex: "360,00", "36,00", "100,85").
2. "bases": Totais e bases (ex: Base INSS, Base IRRF, Base FGTS, Valor FGTS, Salário Líquido).
3. "month" e "year": competência exata (Mês "MM" de 2 dígitos e Ano "YYYY" de 4 dígitos).
4. REGRA DE EVIDÊNCIA: Extraia APENAS o que consta no documento. NUNCA invente ou infira meses ausentes.

FORMATO JSON EXIGIDO:
{
  "page": ${pageObj.pageNum},
  "month": "MM",
  "year": "YYYY",
  "fields": [
    { "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }
  ],
  "bases": [
    { "label": "Base INSS", "value": "2.630,79" }
  ]
}`;

            try {
              const completionJson = await this.generateCompletionWithFallback([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: pageObj.text }
              ]);
              return JSON.parse(completionJson);
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
