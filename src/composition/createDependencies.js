import { TranscriptionUseCases } from '../application/transcriptionUseCases.js';
import { transcriptionStore } from '../services/transcriptionStore.js';
import { TemporaryPdfFiles } from '../infrastructure/files/temporaryPdfFiles.js';
import { PdfValidator } from '../infrastructure/pdf/pdfValidator.js';
import { OpenAiDocumentProcessor } from '../infrastructure/ai/openaiDocumentProcessor.js';
import { PayrollExporter } from '../infrastructure/export/payrollExporter.js';
import { DocumentStorage, TranscriptionRepository } from '../infrastructure/persistence/transcriptionRepository.js';

export function createDependencies({ logger = console } = {}) {
  return {
    transcriptionStore,
    transcription: new TranscriptionUseCases({
      transcriptionRepository: new TranscriptionRepository(transcriptionStore),
      documentStorage: new DocumentStorage(transcriptionStore),
      documentProcessor: new OpenAiDocumentProcessor(),
      exporter: new PayrollExporter(),
      temporaryFiles: new TemporaryPdfFiles(),
      pdfValidator: new PdfValidator(),
      logger
    })
  };
}
