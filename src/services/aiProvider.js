import { openaiService } from './openaiService.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { analyzePageDensity } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

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
      const normalized = normalizePayrollResponse(localResult);
      
      const hasFields = normalized.pages?.some(p => p.fields && p.fields.length > 0);
      if (!hasFields && filePath.toLowerCase().endsWith('.pdf')) {
        try {
          const rawData = await new Promise(r => pdfExtract.extract(filePath, {}, (err, res) => r(res)));
          const charCount = rawData?.pages?.reduce((acc, p) => acc + analyzePageDensity(p.content).charCount, 0) || 0;
          if (charCount < 100) {
            throw new Error('Este PDF é uma imagem/escaneado sem camada de texto (como o payroll-04.pdf). Para extrair este arquivo no servidor, configure a chave de API OPENAI_API_KEY (ou OPENAI_SECRET_KEY) nas variáveis de ambiente do servidor.');
          }
        } catch (err) {
          if (err.message?.includes('OPENAI_API_KEY') || err.message?.includes('imagem/escaneado')) {
            throw err;
          }
        }
      }
      return normalized;
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
