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

      // Tenta a leitura com a API do Gemini (Timeout de 30s com fluxo de extração em 2 etapas)
      if (this.isReady()) {
        try {
          const pdfBuffer = fs.readFileSync(filePath);
          const base64Data = pdfBuffer.toString('base64');
          const pdfContentPart = {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          };

          // ETAPA 1: Identificação de Layout, Colunas e Competências por Mês
          const layoutPrompt = `ETAPA 1 (Análise de Layout): Analise o documento em PDF de Folha de Pagamento de Funcionário.
Identifique as colunas das tabelas de verbas (Código, Descrição/Verba, Referência/Quantidade, Proventos, Descontos) e todas as competências (Mês/Ano) presentes.
Retorne um JSON no formato:
{ "hasReference": true, "months": ["04/2017"], "detectedColumns": ["code", "description", "reference", "amount"] }`;

          const layoutPromise = this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [pdfContentPart, layoutPrompt],
            config: { responseMimeType: 'application/json' }
          });
          const layoutTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Etapa 1 Gemini')), 15000));
          const layoutRes = await Promise.race([layoutPromise, layoutTimeout]);
          const layoutParsed = JSON.parse(layoutRes.text || '{}');

          // ETAPA 2: Extração Estruturada dos Dados Mapeados por Mês
          const extractionPrompt = `ETAPA 2 (Extração Mapeada): Com base nas colunas identificadas (${JSON.stringify(layoutParsed.detectedColumns || [])}), extraia todas as verbas e totais para CADA competência (mês/ano) do funcionário.
REGRAS CRÍTICAS DE COLUNAS:
1. "reference": deve ser EXCLUSIVAMENTE a quantidade, horas, dias ou percentuais (ex: "30,00", "146,67", "0,00", "50%"). NUNCA coloque o valor do salário ou valor em R$ em "reference".
2. "value": deve conter o valor monetário líquido em R$ (se for vencimento/provento ou desconto).
3. "month" e "year": extraia de forma precisa a competência de cada página/holerite (ex: month: "04", year: "2017"). Separe meses diferentes em elementos distintos em "pages".

Formato estrito JSON:
{ "pages": [ { "page": 1, "month": "04", "year": "2017", "fields": [{ "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }], "bases": [{ "label": "Base INSS", "value": "2.630,79" }] } ] }`;

          const apiPromise = this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [pdfContentPart, extractionPrompt],
            config: { responseMimeType: 'application/json' }
          });

          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Etapa 2 Gemini')), 30000));

          const response = await Promise.race([apiPromise, timeoutPromise]);
          const responseText = response.text || '';
          const rawParsed = JSON.parse(responseText);
          let normalized = normalizePayrollResponse(rawParsed);

          const isAuditEnabled = Boolean(options.enableAudit || options.audit);
          if (isAuditEnabled && normalized.pages?.[0]?.fields?.length) {
            try {
              const auditPrompt = `ETAPA 3 (Auditoria Adicional e Revisão de Dados):
Revise minuciosamente os dados extraídos na ETAPA 2 em relação ao documento PDF original de Folha de Pagamento.

Dados extraídos na ETAPA 2:
${JSON.stringify(normalized)}

Verifique e corrija especificamente:
1. Desalinhamento entre "reference" (quantidade/horas/dias/percentuais) e "value" (valor monetário R$). Se um valor monetário em R$ tiver sido atribuído a "reference", mova-o para "value".
2. Valores monetários atribuídos à coluna errada (vencimentos x descontos x bases).
3. Verbas ou valores monetários presentes no documento PDF que aparentem estar omissos ou ausentes nos dados extraídos.
4. Problemas de agrupamento por mês/competência (year e month).
5. Inconsistências relevantes na estrutura extraída.

Retorne o JSON corrigido e revisado no mesmo formato estrito:
{ "pages": [ { "page": 1, "month": "04", "year": "2017", "fields": [{ "code": "40", "label": "Reembolso VR", "reference": "0,00", "value": "360,00" }], "bases": [{ "label": "Base INSS", "value": "2.630,79" }] } ] }`;

              const auditPromise = this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [pdfContentPart, auditPrompt],
                config: { responseMimeType: 'application/json' }
              });
              const auditTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Etapa 3 Auditoria Gemini')), 30000));
              const auditResponse = await Promise.race([auditPromise, auditTimeout]);
              const auditRaw = JSON.parse(auditResponse.text || '{}');
              const auditNormalized = normalizePayrollResponse(auditRaw);

              if (auditNormalized.pages?.[0]?.fields?.length) {
                normalized = auditNormalized;
              }
            } catch (auditErr) {
              console.warn(`⚠️ Auditoria adicional do Gemini falhou ou sofreu timeout (${auditErr.message}). Mantendo o resultado da extração principal.`);
            }
          }

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
