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
}

export const mindeeService = new MindeeService();
