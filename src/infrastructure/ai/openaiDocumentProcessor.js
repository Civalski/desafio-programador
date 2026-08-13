import { openaiService } from '../../services/openaiService.js';

/** Infrastructure adapter: isolates the application layer from the OpenAI SDK. */
export class OpenAiDocumentProcessor {
  isReady() { return openaiService.isReady(); }
  parseDocument(filePath, type, options) {
    if (!this.isReady()) throw new Error('OPENAI_NOT_CONFIGURED: configure OPENAI_API_KEY ou OPENAI_SECRET_KEY para transcrever documentos.');
    return openaiService.parseDocument(filePath, type, options);
  }
}
