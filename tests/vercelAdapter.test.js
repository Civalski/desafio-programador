import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { dispatchToFastify } from '../api/index.js';

test('adaptador Vercel aguarda Fastify finalizar a resposta', async () => {
  const response = new EventEmitter();
  let released = false;
  const server = new EventEmitter();
  server.on('request', () => setTimeout(() => response.emit('finish'), 10));

  const dispatch = dispatchToFastify(server, {}, response).then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  await dispatch;
  assert.equal(released, true);
});
