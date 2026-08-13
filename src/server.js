import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { transcriptionRoutes } from './routes/transcriptionRoutes.js';
import { createDependencies } from './composition/createDependencies.js';
import { BasicAuth } from './infrastructure/auth/basicAuth.js';
import { authRoutes, requireAuthentication } from './routes/authRoutes.js';

// Na Vercel as variáveis já chegam em process.env; carregar um .env ausente é
// normal e não deve poluir os logs da Function.
dotenv.config({ quiet: true });

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

  // Composition root: infrastructure is assembled here and injected into HTTP adapters.
  const dependencies = opts.dependencies || createDependencies({ logger: app.log });
  const auth = opts.auth || new BasicAuth();
  await app.register(authRoutes, { auth });
  app.addHook('onRequest', requireAuthentication(auth));
  await app.register(transcriptionRoutes, { transcription: dependencies.transcription });

  // Serve arquivos estáticos da UI compilada em 'dist' (se o diretório existir)
  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/'
    });
  }

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
