import { waitUntil } from '@vercel/functions';
import { ApplicationError } from '../application/errors.js';

function sendError(reply, error) {
  if (error instanceof ApplicationError) return reply.status(error.statusCode).send({ erro: error.message });
  return reply.status(500).send({ erro: 'Erro interno no processamento do documento' });
}

function defer(work) {
  if (process.env.VERCEL) waitUntil(work);
  else setImmediate(() => { void work; });
}

/** HTTP adapter. Business orchestration lives in TranscriptionUseCases. */
export async function transcriptionRoutes(fastify, options) {
  const transcription = options?.transcription;
  if (!transcription) throw new Error('transcriptionRoutes requer os casos de uso de transcrição');

  fastify.get('/healthz', async (_request, reply) => reply.status(200).send({ status: 'ok' }));

  fastify.post('/api/transcricoes', async (request, reply) => {
    if (!request.isMultipart()) return reply.status(400).send({ erro: 'A requisição deve ser multipart/form-data' });
    let buffer = null; let name = 'upload.pdf'; let mimeType = ''; let type = null;
    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'arquivo') { buffer = await part.toBuffer(); name = part.filename || name; mimeType = part.mimetype || ''; }
      if (part.type === 'field' && part.fieldname === 'tipo') type = part.value;
    }
    try {
      const job = await transcription.create({ type, file: { buffer, name, mimeType } });
      defer(transcription.process(job.id, buffer));
      return reply.status(202).send({ id: job.id });
    } catch (error) { return sendError(reply, error); }
  });

  fastify.get('/api/transcricoes', async (_request, reply) => reply.send({ items: await transcription.list() }));
  fastify.get('/api/transcricoes/:id', async (request, reply) => {
    try { const job = await transcription.get(request.params.id); return reply.send({ id: job.id, tipo: job.tipo, status: job.status, progress: job.progress, erro: job.erro, value: job.value }); }
    catch (error) { return sendError(reply, error); }
  });
  fastify.get('/api/transcricoes/:id/arquivo', async (request, reply) => {
    try { const { job, content } = await transcription.getDocument(request.params.id); return reply.type('application/pdf').header('content-disposition', `inline; filename="${(job.fileName || 'documento.pdf').replaceAll('"', '')}"`).send(content); }
    catch (error) { if (error instanceof ApplicationError) return sendError(reply, error); return reply.status(404).send({ erro: 'PDF original não está mais disponível.' }); }
  });
  fastify.post('/api/transcricoes/:id/retomar', async (request, reply) => {
    try { const { job, process } = await transcription.resume(request.params.id); if (process) defer(process); return reply.status(202).send({ id: job.id, status: job.status }); }
    catch (error) { return sendError(reply, error); }
  });
  fastify.put('/api/transcricoes/:id', async (request, reply) => {
    try { const job = await transcription.update(request.params.id, request.body?.value); return reply.send({ id: job.id, status: job.status, value: job.value }); }
    catch (error) { return sendError(reply, error); }
  });
  fastify.delete('/api/transcricoes/:id', async (request, reply) => {
    try { await transcription.delete(request.params.id); return reply.status(204).send(); }
    catch (error) { return sendError(reply, error); }
  });
  fastify.get('/api/transcricoes/:id/planilha', async (request, reply) => {
    try { const exportData = await transcription.export(request.params.id, request.query?.formato || 'xlsx'); return reply.header('Content-Type', exportData.contentType).header('Content-Disposition', `attachment; filename="${exportData.filename}"`).send(exportData.content); }
    catch (error) { return sendError(reply, error); }
  });
}
