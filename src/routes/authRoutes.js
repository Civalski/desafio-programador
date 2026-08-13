import { BasicAuth } from '../infrastructure/auth/basicAuth.js';

export async function authRoutes(fastify, { auth = new BasicAuth() } = {}) {
  fastify.get('/api/auth/session', async request => ({ enabled: auth.enabled, authenticated: auth.hasValidSession(request.headers.cookie) }));
  fastify.post('/api/auth/login', async (request, reply) => {
    if (!auth.enabled) return reply.send({ enabled: false, authenticated: true });
    const { username, password } = request.body || {};
    if (!auth.authenticate(username, password)) return reply.status(401).send({ erro: 'Usuário ou senha inválidos.' });
    return reply.header('set-cookie', auth.cookie(auth.createSession())).send({ enabled: true, authenticated: true });
  });
  fastify.post('/api/auth/logout', async (_request, reply) => reply.header('set-cookie', auth.clearCookie()).send({ ok: true }));
}

export function requireAuthentication(auth) {
  return async (request, reply) => {
    if (request.url.startsWith('/api/auth/') || !auth.enabled || auth.hasValidSession(request.headers.cookie)) return;
    return reply.status(401).send({ erro: 'Autenticação necessária.' });
  };
}
