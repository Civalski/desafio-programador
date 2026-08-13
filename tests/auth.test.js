import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { BasicAuth } from '../src/infrastructure/auth/basicAuth.js';

test('login protege API e cria sessão HTTP-only assinada', async () => {
  const auth = new BasicAuth({ AUTH_USERNAME: 'teste', AUTH_PASSWORD: 'senha-segura', AUTH_SESSION_SECRET: 'segredo-de-teste-comprido' });
  const app = await buildApp({ logger: false, auth }); await app.ready();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/transcricoes' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'teste', password: 'errada' } })).statusCode, 401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'teste', password: 'senha-segura' } });
    assert.equal(login.statusCode, 200); assert.match(login.headers['set-cookie'], /HttpOnly/);
    assert.equal((await app.inject({ method: 'GET', url: '/api/transcricoes', headers: { cookie: login.headers['set-cookie'] } })).statusCode, 200);
  } finally { await app.close(); }
});
