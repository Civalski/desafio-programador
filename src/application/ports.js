/**
 * Ports used by the application layer. Implementations live in infrastructure.
 *
 * TranscriptionRepository: job lifecycle and incremental extraction results.
 * DocumentStorage: original PDF persistence.
 * DocumentProcessor: parseDocument(filePath, documentType, callbacks).
 * Exporter: generate(job, format).
 */
export const ports = Object.freeze(['transcriptionRepository', 'documentStorage', 'documentProcessor', 'exporter', 'temporaryFiles', 'pdfValidator']);
