import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { transcriptionStore } from '../src/services/transcriptionStore.js';

test('API de holerite: saúde, edição e exportação', async () => {
  const app = await buildApp({ logger: false });
  await app.ready();
  await transcriptionStore.clear();
  try {
    assert.deepEqual((await app.inject({ method: 'GET', url: '/healthz' })).json(), { status: 'ok' });
    const job = await transcriptionStore.createJob('holerite');
    await transcriptionStore.completeJob(job.id, { pages: [{ page: 1, month: '01', year: '2024', fields: [], bases: [] }] });
    const saved = await app.inject({ method: 'PUT', url: `/api/transcricoes/${job.id}`, payload: { value: { pages: [{ page: 1, month: '01', year: '2024', fields: [{ label: 'Salário', value: '1.000,00' }], bases: [] }] } } });
    assert.equal(saved.statusCode, 200);
    const csv = await app.inject({ method: 'GET', url: `/api/transcricoes/${job.id}/planilha?formato=csv` });
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /Salário/);
  } finally { await app.close(); }
});

test('API recusa tipos de documento fora do escopo', async () => {
  const app = await buildApp({ logger: false });
  await app.ready();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/transcricoes', headers: { 'content-type': 'multipart/form-data; boundary=boundary' }, payload: '--boundary\r\nContent-Disposition: form-data; name="tipo"\r\n\r\noutro\r\n--boundary--\r\n' });
    assert.equal(response.statusCode, 400);
  } finally { await app.close(); }
});
