import * as mindee from 'mindee';
import { config, validateEnv } from '../config/env.js';

export class MindeeService {
  constructor(apiKey = config.mindeeApiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.initClient();
  }

  /**
   * Inicializa o cliente da API do Mindee com a chave fornecida.
   */
  initClient() {
    if (!this.apiKey) {
      console.warn('⚠️ Alerta: MINDEE_API não configurado. O cliente Mindee não foi inicializado.');
      return;
    }

    try {
      this.client = new mindee.Client({ apiKey: this.apiKey });
    } catch (error) {
      console.error('❌ Erro ao inicializar o cliente Mindee:', error.message);
      throw error;
    }
  }

  /**
   * Verifica se o cliente da API do Mindee está configurado e pronto para uso.
   */
  isReady() {
    return Boolean(this.apiKey && this.client);
  }

  /**
   * Retorna a instância do cliente Mindee.
   */
  getClient() {
    if (!this.isReady()) {
      validateEnv();
      this.initClient();
    }
    return this.client;
  }

  /**
   * Prepara o objeto de documento a partir do caminho do arquivo (sem executar a chamada de leitura).
   * @param {string} filePath Caminho do arquivo a ser lido no futuro.
   */
  prepareDocumentInput(filePath) {
    if (!this.isReady()) {
      throw new Error('Cliente Mindee não está inicializado.');
    }
    return this.client.docFromPath(filePath);
  }

  /**
   * Envia um documento de Cartão de Ponto para parsing no Mindee SDK e normaliza no DTO padronizado.
   * @param {string} filePath Caminho do PDF do cartão de ponto.
   * @returns {Promise<Object>} DTO normalizado do Cartão de Ponto.
   */
  async parseTimeCard(filePath) {
    try {
      const inputDoc = this.prepareDocumentInput(filePath);
      
      // Chamada genérica de extração via Mindee SDK
      // Tenta usar produto financeiro/customizado se configurado, ou fallback de extração tabular
      let apiResponse = null;
      if (this.client.parse) {
        apiResponse = await this.client.parse(mindee.product.FinancialDocumentV1, inputDoc);
      } else {
        apiResponse = await this.client.enqueueAndParse(mindee.product.FinancialDocumentV1, inputDoc);
      }

      const { normalizeTimeCardResponse } = await import('../normalizers/timeCardNormalizer.js');
      return normalizeTimeCardResponse(apiResponse?.document || apiResponse);
    } catch (error) {
      console.error(`❌ Erro no parsing de Cartão de Ponto (${filePath}):`, error.message);
      
      // Fallback seguro em caso de cota zerada ou falta de conexão com API em dev
      const { normalizeTimeCardResponse } = await import('../normalizers/timeCardNormalizer.js');
      return normalizeTimeCardResponse({
        pages: [{ page: 1, days: [] }],
        error: error.message
      });
    }
  }

  /**
   * Envia um documento de Holerite (Payroll) para parsing no Mindee SDK e normaliza no DTO padronizado.
   * @param {string} filePath Caminho do PDF do holerite.
   * @returns {Promise<Object>} DTO normalizado do Holerite.
   */
  async parsePayroll(filePath) {
    try {
      const inputDoc = this.prepareDocumentInput(filePath);
      
      let apiResponse = null;
      if (this.client.parse) {
        apiResponse = await this.client.parse(mindee.product.FinancialDocumentV1, inputDoc);
      } else {
        apiResponse = await this.client.enqueueAndParse(mindee.product.FinancialDocumentV1, inputDoc);
      }

      const { normalizePayrollResponse } = await import('../normalizers/payrollNormalizer.js');
      return normalizePayrollResponse(apiResponse?.document || apiResponse);
    } catch (error) {
      console.error(`❌ Erro no parsing de Holerite (${filePath}):`, error.message);
      
      const { normalizePayrollResponse } = await import('../normalizers/payrollNormalizer.js');
      return normalizePayrollResponse({
        pages: [{ page: 1, year: '', month: '', fields: [], bases: [] }],
        error: error.message
      });
    }
  }

  /**
   * Roteador principal para parsear documentos baseado no tipo especificado.
   * @param {string} filePath 
   * @param {'time_card' | 'payroll'} documentType 
   * @returns {Promise<Object>}
   */
  async parseDocument(filePath, documentType) {
    if (documentType === 'time_card') {
      return this.parseTimeCard(filePath);
    } else if (documentType === 'payroll') {
      return this.parsePayroll(filePath);
    } else {
      throw new Error(`Tipo de documento não suportado: ${documentType}`);
    }
  }
}

export const mindeeService = new MindeeService();

