import { openaiService } from './openaiService.js';
import { extractPayrollLocalPdf } from '../utils/pdfExtractor.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { analyzePageDensity } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

export class AIProviderService {
  async parseDocument(filePath, documentType, options = {}) {
    if (openaiService.isReady()) {
      console.log('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â¡ Utilizando provedor OpenAI para processamento do documento...');
      return await openaiService.parseDocument(filePath, documentType, options);
    }

    console.warn('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â OpenAI sem chave ativa configurada. Utilizando extrator local em PDF...');
    if (options.onProgress) {
      options.onProgress({ current: 0, total: 1, percentage: 10, message: 'Utilizando extrator local de PDF...', log: 'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â¡ Executando OCR local (sem chave OpenAI)...' });
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
            throw new Error('Este PDF ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© uma imagem/escaneado sem camada de texto (como o payroll-04.pdf). Para extrair este arquivo no servidor, configure a chave de API OPENAI_API_KEY (ou OPENAI_SECRET_KEY) nas variÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡veis de ambiente do servidor.');
          }
        } catch (err) {
          if (err.message?.includes('OPENAI_API_KEY') || err.message?.includes('imagem/escaneado')) {
            throw err;
          }
        }
      }
      return normalized;
    }

    throw new Error('Tipo de documento não suportado.');
  }
}

export const aiProviderService = new AIProviderService();
