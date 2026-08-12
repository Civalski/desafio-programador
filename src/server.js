import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { transcriptionRoutes } from './routes/transcriptionRoutes.js';

dotenv.config();

/**
 * Constrói e configura a aplicação Fastify.
 * @param {Object} opts Opções do Fastify.
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger ?? { level: process.env.LOG_LEVEL || 'info' },
    ...opts
  });

  // Habilita CORS para permitir chamadas do frontend web
  await app.register(cors, {
    origin: true
  });

  // Habilita suporte a uploads multipart/form-data com limite de tamanho de 50MB
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50 MB
    }
  });

  // Registra as rotas da API
  await app.register(transcriptionRoutes);

  return app;
}

// Inicializa o servidor se executado diretamente
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const start = async () => {
    try {
      const server = await buildApp();
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || '0.0.0.0';

      await server.listen({ port: Number(port), host });
      console.log(`🚀 Servidor Fastify rodando em http://${host}:${port}`);
    } catch (err) {
      console.error('❌ Erro ao iniciar servidor:', err);
      process.exit(1);
    }
  };
  start();
}
