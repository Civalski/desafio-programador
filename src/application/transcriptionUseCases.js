import { isCompleted, isSupportedDocumentType } from '../domain/transcription.js';
import { NotFoundError, ValidationError } from './errors.js';

function persistenceQueue() {
  let pending = Promise.resolve(); let firstError = null;
  return {
    enqueue(operation) { pending = pending.then(operation).catch(error => { firstError ||= error; }); return pending; },
    async flush() { await pending; if (firstError) throw firstError; }
  };
}

export class TranscriptionUseCases {
  constructor({ transcriptionRepository, documentStorage, documentProcessor, exporter, temporaryFiles, pdfValidator, logger = console }) {
    Object.assign(this, { transcriptionRepository, documentStorage, documentProcessor, exporter, temporaryFiles, pdfValidator, logger });
  }

  async create({ type, file }) {
    if (!isSupportedDocumentType(type)) throw new ValidationError('O parâmetro "tipo" é obrigatório e deve ser "holerite"');
    if (!file?.buffer?.length) throw new ValidationError('O arquivo "arquivo" em formato PDF/imagem é obrigatório');
    if (file.mimeType !== 'application/pdf' || !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ValidationError('O arquivo deve ser um PDF válido (MIME application/pdf e assinatura %PDF-).');
    const job = await this.transcriptionRepository.createJob(type, { name: file.name, size: file.buffer.length });
    await this.documentStorage.saveDocument(job, file.buffer);
    try { await this.temporaryFiles.withPdf(job.id, file.buffer, path => this.pdfValidator.assertReadable(path)); }
    catch { await this.transcriptionRepository.deleteJob(job.id); throw new ValidationError('O PDF está corrompido ou não pôde ser lido.'); }
    return job;
  }

  async process(jobId, document = null) {
    const job = await this.requireJob(jobId);
    const content = document || await this.documentStorage.getDocument(job);
    return this.temporaryFiles.withPdf(job.id, content, filePath => this.processFile(job, filePath));
  }

  async processFile(job, filePath) {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const queue = persistenceQueue();
          const completedResultKeys = await this.transcriptionRepository.getCompletedResultKeys(job.id);
          const completedResults = await this.transcriptionRepository.getCheckpointResults(job.id);
          const result = await this.documentProcessor.parseDocument(filePath, 'payroll', {
            completedResultKeys, completedResults,
            onProgress: update => queue.enqueue(() => this.transcriptionRepository.updateJobProgress(job.id, update)),
            onPageCompleted: item => queue.enqueue(() => this.transcriptionRepository.saveResult(job.id, item.resultKey, item))
          });
          await queue.flush();
          return this.transcriptionRepository.completeJob(job.id, result);
        } catch (error) {
          this.logger.error?.({ err: error, jobId: job.id, attempt: attempt + 1 }, 'Falha no processamento do documento');
          if (attempt === 1) return this.transcriptionRepository.failJob(job.id, error.message || 'Falha no processamento do documento');
          await this.transcriptionRepository.updateJobProgress(job.id, { message: 'Falha transitória; retomando páginas pendentes...', log: 'A primeira tentativa falhou. Iniciando uma retomada limitada.' });
        }
      }
    } catch (error) { return this.transcriptionRepository.failJob(job.id, error.message || 'Falha no processamento do documento'); }
  }

  async resume(id) {
    const job = await this.requireJob(id);
    if (job.status === 'processando') return { job, process: null };
    let document;
    try { document = await this.documentStorage.getDocument(job); }
    catch { throw new ValidationError('O PDF original não está mais disponível para retomada.'); }
    const resumed = await this.transcriptionRepository.startRetry(job.id);
    return { job: resumed, process: this.process(resumed.id, document) };
  }

  async get(id) { return this.requireJob(id); }
  async list() { return this.transcriptionRepository.listJobs(); }
  async getDocument(id) { const job = await this.requireJob(id); return { job, content: await this.documentStorage.getDocument(job) }; }
  async delete(id) { const job = await this.transcriptionRepository.deleteJob(id); if (!job) throw new NotFoundError(); return job; }
  async update(id, value) { await this.requireJob(id); if (!value) throw new ValidationError('O corpo da requisição deve conter o objeto "value"'); return this.transcriptionRepository.updateJobValue(id, value); }
  async export(id, format) { const job = await this.requireJob(id); if (!isCompleted(job)) throw new ApplicationError('A transcrição ainda não foi concluída com sucesso', 422); return this.exporter.generate(job, format); }
  async requireJob(id) { const job = await this.transcriptionRepository.getJob(id); if (!job) throw new NotFoundError(); return job; }
}

export { persistenceQueue };
