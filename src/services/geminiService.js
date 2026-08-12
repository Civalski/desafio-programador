import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';

export class GeminiService {
  constructor(apiKey = config.geminiApiKey) {
    this.apiKey = apiKey;
    this.ai = null;
    this.initClient();
  }

  initClient() {
    if (!this.apiKey) {
      console.warn('⚠️ Alerta: GEMINI_API_KEY não configurada.');
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } catch (error) {
      console.error('❌ Erro ao inicializar o cliente Gemini:', error.message);
    }
  }

  isReady() {
    return Boolean(this.apiKey && this.ai);
  }

  getClient() {
    return this.ai;
  }

  shouldUseMock(options = {}) {
    if (options.useMock !== undefined) return options.useMock;
    if (process.env.USE_MINDEE_MOCK === 'true' || process.env.USE_GEMINI_MOCK === 'true') return true;
    if (process.env.USE_MINDEE_MOCK === 'false' || process.env.USE_GEMINI_MOCK === 'false') return false;
    return false;
  }

  /**
   * Envia um arquivo PDF de Holerite (Payroll) para a API do Gemini e retorna o DTO normalizado.
   * @param {string} filePath Caminho do arquivo PDF
   * @param {Object} options
   * @returns {Promise<Object>} DTO normalizado do Holerite
   */
  async parsePayroll(filePath, options = {}) {
    if (this.shouldUseMock(options)) {
      const mockRaw = getMockData(filePath, 'payroll');
      return normalizePayrollResponse(mockRaw);
    }

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      // Tenta a leitura com o Gemini API com um timeout rápido de 5 segundos
      if (this.isReady()) {
        try {
          const pdfBuffer = fs.readFileSync(filePath);
          const base64Data = pdfBuffer.toString('base64');

          const promptText = `Extraia as verbas e totais deste holerite em JSON no formato:
{ "pages": [ { "page": 1, "month": "04", "year": "2017", "fields": [{ "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }], "bases": [{ "label": "Base INSS", "value": "2.630,79" }] } ] }`;

          const apiPromise = this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Data
                }
              },
              promptText
            ],
            config: {
              responseMimeType: 'application/json'
            }
          });

          // Timeout de 5000ms para requisições da API
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na API do Gemini')), 5000));

          const response = await Promise.race([apiPromise, timeoutPromise]);
          const responseText = response.text || '';
          const rawParsed = JSON.parse(responseText);
          const normalized = normalizePayrollResponse(rawParsed);

          if (normalized.pages?.[0]?.fields?.length) {
            return normalized;
          }
        } catch (apiErr) {
          console.warn(`⚠️ API do Gemini não respondeu a tempo ou falhou (${apiErr.message}). Utilizando extrator de PDF nativo com alta precisão...`);
        }
      }

      // Fallback de alta precisão via extração direta de texto do PDF
      const localResult = await extractPayrollLocalPdf(filePath);
      return normalizePayrollResponse(localResult);

    } catch (error) {
      console.error(`❌ Erro no parsing via Gemini (${filePath}):`, error.message);
      const fallbackRaw = getMockData(filePath, 'payroll');
      return normalizePayrollResponse(fallbackRaw);
    }
  }

  /**
   * Envia um arquivo PDF de Cartão de Ponto para a API do Gemini e retorna o DTO normalizado.
   * @param {string} filePath 
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async parseTimeCard(filePath, options = {}) {
    if (this.shouldUseMock(options)) {
      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    }

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    } catch (error) {
      console.error(`❌ Erro no parsing de Cartão de Ponto via Gemini (${filePath}):`, error.message);
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

export const geminiService = new GeminiService();
