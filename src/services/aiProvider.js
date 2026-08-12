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
    if (documentType === 'payroll') {
      const localResult = await extractPayrollLocalPdf(filePath);
      return normalizePayrollResponse(localResult);
    } else {
      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    }
  }
}

export const aiProviderService = new AIProviderService();
