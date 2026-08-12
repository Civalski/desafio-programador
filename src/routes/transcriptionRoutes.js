import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { transcriptionStore } from '../services/transcriptionStore.js';
import { aiProviderService } from '../services/aiProvider.js';
import { generateExport } from '../utils/exportUtils.js';

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

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'arquivo') {
          fileBuffer = await part.toBuffer();
          fileName = part.filename || 'upload.pdf';
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'tipo') {
          tipo = part.value;
        }
      }
    }

    // Validação dos parâmetros obrigatórios
    if (!tipo || (tipo !== 'cartao-ponto' && tipo !== 'holerite')) {
      return reply.status(400).send({
        erro: 'O parâmetro "tipo" é obrigatório e deve ser "cartao-ponto" ou "holerite"'
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({
        erro: 'O arquivo "arquivo" em formato PDF/imagem é obrigatório'
      });
    }

    // Cria o trabalho de transcrição no estado 'processando'
    const job = transcriptionStore.createJob(tipo);

    // Salva o buffer no sistema de arquivos temporário do sistema operacional (fora da pasta do projeto)
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `quick_filler_${job.id}_${fileName}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    // ⚡ Processamento Assíncrono (sem await na resposta HTTP)
    setImmediate(async () => {
      try {
        const docTypeMapping = tipo === 'cartao-ponto' ? 'time_card' : 'payroll';
        const parsedResult = await aiProviderService.parseDocument(tempFilePath, docTypeMapping);

        // Se o resultado for válido, conclui o job
        transcriptionStore.completeJob(job.id, parsedResult);
      } catch (error) {
        console.error(`❌ Erro no processamento assíncrono do job ${job.id}:`, error);
        transcriptionStore.failJob(job.id, error.message || 'Falha no processamento do documento');
      } finally {
        // Limpa o arquivo temporário
        if (fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (_) {}
        }
      }
    });

    // Retorna HTTP 202 Accepted imediatamente com o ID
    return reply.status(202).send({
      id: job.id
    });
  });

  // 2. GET /api/transcricoes/:id - Consulta de status e resultado
  fastify.get('/api/transcricoes/:id', async (request, reply) => {
    const { id } = request.params;
    const job = transcriptionStore.getJob(id);

    if (!job) {
      return reply.status(404).send({
        erro: 'Transcrição não encontrada'
      });
    }

    return reply.status(200).send({
      id: job.id,
      tipo: job.tipo,
      status: job.status,
      erro: job.erro,
      value: job.value
    });
  });

  // 3. PUT /api/transcricoes/:id - Atualização da transcrição com edições da UI
  fastify.put('/api/transcricoes/:id', async (request, reply) => {
    const { id } = request.params;
    const job = transcriptionStore.getJob(id);

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

    const updatedJob = transcriptionStore.updateJobValue(id, value);

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

    const job = transcriptionStore.getJob(id);

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
