import { openaiService } from './openaiService.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';

export class AIProviderService {
  async parseDocument(filePath, documentType, options = {}) {
    if (openaiService.isReady()) {
      console.log('⚡ Utilizando provedor OpenAI para processamento do documento...');
      return await openaiService.parseDocument(filePath, documentType, options);
    }

    console.warn('⚠️ OpenAI sem chave ativa configurada. Utilizando extrator local em PDF...');
    if (options.onProgress) {
      options.onProgress({ current: 0, total: 1, percentage: 10, message: 'Utilizando extrator local de PDF...', log: '⚡ Executando OCR local (sem chave OpenAI)...' });
    }

    if (documentType === 'payroll') {
      const localResult = await extractPayrollLocalPdf(filePath, options);
      return normalizePayrollResponse(localResult);
    } else {
      if (options.onProgress) {
        options.onProgress({ current: 1, total: 1, percentage: 100, message: 'Cartão de ponto processado.', log: '✅ Cartão de ponto estruturado localmente.' });
      }
      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    }
  }
}

export const aiProviderService = new AIProviderService();
