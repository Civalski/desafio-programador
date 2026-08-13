import { openaiService } from './openaiService.js';

export class AIProviderService {
  async parseDocument(filePath, documentType, options = {}) {
    if (!openaiService.isReady()) {
      throw new Error('OPENAI_NOT_CONFIGURED: configure OPENAI_API_KEY ou OPENAI_SECRET_KEY para transcrever documentos.');
    }

    return openaiService.parseDocument(filePath, documentType, options);
  }
}

export const aiProviderService = new AIProviderService();
