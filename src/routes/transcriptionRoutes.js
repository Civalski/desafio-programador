import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { waitUntil } from '@vercel/functions';
import { transcriptionStore } from '../services/transcriptionStore.js';
import { aiProviderService } from '../services/aiProvider.js';
import { generateExport } from '../utils/exportUtils.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();
const isReadablePdf = async filePath => { try { await new Promise((resolve, reject) => pdfExtract.extract(filePath, {}, error => error ? reject(error) : resolve())); return true; } catch { return false; } };

function createPersistenceQueue() {
  let pending = Promise.resolve();
  let firstError = null;
  const enqueue = operation => {
    pending = pending.then(operation).catch(error => { firstError ||= error; });
    return pending;
  };
  const flush = async () => {
    await pending;
    if (firstError) throw firstError;
  };
  return { enqueue, flush };
}

/**
 * Registra as rotas da API HTTP no Fastify.
 * @param {import('fastify').FastifyInstance} fastify 
 */
export async function transcriptionRoutes(fastify) {
  // 5. GET /healthz - Endpoint de Healthcheck
  fastify.get('/healthz', async (request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // 1. POST /api/transcricoes - Upload e disparo assíncrono de transcrição
  fastify.post('/api/transcricoes', async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({
        erro: 'A requisição deve ser multipart/form-data'
      });
    }

    const parts = request.parts();
    let fileBuffer = null;
    let fileName = 'upload.pdf';
    let tipo = null;
    let mimeType = '';

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'arquivo') {
          fileBuffer = await part.toBuffer();
          fileName = part.filename || 'upload.pdf';
          mimeType = part.mimetype || '';
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'tipo') {
          tipo = part.value;
        }
      }
    }

    // Validação dos parâmetros obrigatórios
    if (tipo !== 'holerite') {
      return reply.status(400).send({
        erro: 'O parâmetro "tipo" é obrigatório e deve ser "holerite"'
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({
        erro: 'O arquivo "arquivo" em formato PDF/imagem é obrigatório'
      });
    }

    // Cria o trabalho de transcrição no estado 'processando'
    if (mimeType !== 'application/pdf' || !fileBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return reply.status(400).send({ erro: 'O arquivo deve ser um PDF válido (MIME application/pdf e assinatura %PDF-).' });
    }
    const job = await transcriptionStore.createJob(tipo, { name: fileName, size: fileBuffer.length });
    await transcriptionStore.saveDocument(job, fileBuffer);

    // Salva o buffer no sistema de arquivos temporário do sistema operacional (fora da pasta do projeto)
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `quick_filler_${job.id}.pdf`);
    fs.writeFileSync(tempFilePath, fileBuffer);
    if (!await isReadablePdf(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      return reply.status(400).send({ erro: 'O PDF está corrompido ou não pôde ser lido.' });
    }

    const processJob = async (automaticRetry = false) => {
      try {
        const docTypeMapping = 'payroll';
        const persistence = createPersistenceQueue();
        const onProgress = progUpdate => persistence.enqueue(() => transcriptionStore.updateJobProgress(job.id, progUpdate));
        const onPageCompleted = page => persistence.enqueue(() => transcriptionStore.savePageResult(job.id, page.page, page));
        const completedPageNumbers = await transcriptionStore.getCompletedPageNumbers(job.id);
        const parsedResult = await aiProviderService.parseDocument(tempFilePath, docTypeMapping, { onProgress, onPageCompleted, completedPageNumbers });
        await persistence.flush();

        // Se o resultado for válido, conclui o job
        await transcriptionStore.completeJob(job.id, parsedResult);
      } catch (error) {
        request.log.error({ err: error, jobId: job.id }, 'Falha no processamento do documento');
        if (!automaticRetry) {
          await transcriptionStore.startRetry(job.id, 'Falha transitória; retomando páginas pendentes...');
          return processJob(true);
        }
        await transcriptionStore.failJob(job.id, error.message || 'Falha no processamento do documento');
      } finally {
        // Limpa o arquivo temporário
        if (fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (_) {}
        }
      }
    };

    const processPromise = processJob();

    if (process.env.VERCEL) {
      waitUntil(processPromise);
    } else {
      setImmediate(() => processPromise);
    }

    // Retorna HTTP 202 Accepted imediatamente para que a interface possa fazer polling.
    return reply.status(202).send({
      id: job.id
    });
  });

  fastify.get('/api/transcricoes', async (_request, reply) => {
    return reply.send({ items: await transcriptionStore.listJobs() });
  });

  fastify.get('/api/transcricoes/:id/arquivo', async (request, reply) => {
    const job = await transcriptionStore.getJob(request.params.id);
    if (!job) return reply.status(404).send({ erro: 'Transcrição não encontrada' });
    try {
      const content = await transcriptionStore.getDocument(job);
      return reply.type('application/pdf').header('content-disposition', `inline; filename="${(job.fileName || 'documento.pdf').replaceAll('"', '')}"`).send(content);
    } catch { return reply.status(404).send({ erro: 'PDF original não está mais disponível.' }); }
  });

  fastify.post('/api/transcricoes/:id/retomar', async (request, reply) => {
    const job = await transcriptionStore.getJob(request.params.id);
    if (!job) return reply.status(404).send({ erro: 'Transcrição não encontrada' });
    if (job.status === 'processando') return reply.status(202).send({ id: job.id, status: job.status });
    let content;
    try { content = await transcriptionStore.getDocument(job); } catch { return reply.status(409).send({ erro: 'O PDF original não está disponível para retomada.' }); }
    const resumed = await transcriptionStore.startRetry(job.id);
    const tempFilePath = path.join(os.tmpdir(), `quick_filler_${resumed.id}_resume.pdf`);
    fs.writeFileSync(tempFilePath, content);
    const processPromise = (async () => {
      try {
        const mapping = 'payroll';
        const persistence = createPersistenceQueue();
        const completedPageNumbers = await transcriptionStore.getCompletedPageNumbers(resumed.id);
        const result = await aiProviderService.parseDocument(tempFilePath, mapping, { completedPageNumbers, onProgress: update => persistence.enqueue(() => transcriptionStore.updateJobProgress(resumed.id, update)), onPageCompleted: page => persistence.enqueue(() => transcriptionStore.savePageResult(resumed.id, page.page, page)) });
        await persistence.flush();
        await transcriptionStore.completeJob(resumed.id, result);
      } catch (error) { await transcriptionStore.failJob(resumed.id, error.message || 'Falha ao retomar auditoria'); }
      finally { try { fs.unlinkSync(tempFilePath); } catch (_) {} }
    })();
    if (process.env.VERCEL) waitUntil(processPromise); else setImmediate(() => processPromise);
    return reply.status(202).send({ id: resumed.id, status: 'processando' });
  });

  fastify.delete('/api/transcricoes/:id', async (request, reply) => {
    const job = await transcriptionStore.deleteJob(request.params.id);
    if (!job) return reply.status(404).send({ erro: 'Transcrição não encontrada' });
    return reply.status(204).send();
  });

  // 2. GET /api/transcricoes/:id - Consulta de status e resultado
  fastify.get('/api/transcricoes/:id', async (request, reply) => {
    const { id } = request.params;
    const job = await transcriptionStore.getJob(id);

    if (!job) {
      return reply.status(404).send({
        erro: 'Transcrição não encontrada'
      });
    }

    return reply.status(200).send({
      id: job.id,
      tipo: job.tipo,
      status: job.status,
      progress: job.progress,
      erro: job.erro,
      value: job.value
    });
  });

  // 3. PUT /api/transcricoes/:id - Atualização da transcrição com edições da UI
  fastify.put('/api/transcricoes/:id', async (request, reply) => {
    const { id } = request.params;
    const job = await transcriptionStore.getJob(id);

    if (!job) {
      return reply.status(404).send({
        erro: 'Transcrição não encontrada'
      });
    }

    const { value } = request.body || {};
    if (!value) {
      return reply.status(400).send({
        erro: 'O corpo da requisição deve conter o objeto "value"'
      });
    }

    const updatedJob = await transcriptionStore.updateJobValue(id, value);

    return reply.status(200).send({
      id: updatedJob.id,
      status: updatedJob.status,
      value: updatedJob.value
    });
  });

  // 4. GET /api/transcricoes/:id/planilha - Download de planilha (xlsx/csv/json)
  fastify.get('/api/transcricoes/:id/planilha', async (request, reply) => {
    const { id } = request.params;
    const { formato = 'xlsx' } = request.query || {};

    const job = await transcriptionStore.getJob(id);

    if (!job) {
      return reply.status(404).send({
        erro: 'Transcrição não encontrada'
      });
    }

    if (job.status !== 'concluido' || !job.value) {
      return reply.status(422).send({
        erro: 'A transcrição ainda não foi concluída com sucesso'
      });
    }

    const exportData = await generateExport(job, formato);

    reply.header('Content-Type', exportData.contentType);
    reply.header('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    return reply.status(200).send(exportData.content);
  });
}
