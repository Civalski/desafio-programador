import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { transcriptionStore } from '../src/services/transcriptionStore.js';
import { isTimeCardEnabled } from '../src/config/features.js';

test('Time-card fica bloqueado em ambiente hospedado e habilitado localmente', async () => {
  assert.equal(isTimeCardEnabled({}), true);
  assert.equal(isTimeCardEnabled({ VERCEL: '1' }), false);
  assert.equal(isTimeCardEnabled({ VERCEL: '1', ENABLE_TIME_CARD: 'true' }), true);

  const previous = process.env.ENABLE_TIME_CARD;
  process.env.ENABLE_TIME_CARD = 'false';
  const app = await buildApp({ logger: false });
  await app.ready();
  try {
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/transcricoes',
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
      payload: '--boundary\r\nContent-Disposition: form-data; name="tipo"\r\n\r\ncartao-ponto\r\n--boundary--\r\n'
    });
    assert.equal(blocked.statusCode, 403);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_TIME_CARD;
    else process.env.ENABLE_TIME_CARD = previous;
    await app.close();
  }
});

test('Fastify HTTP API - AI Harness Spec 03 Contracts', async (t) => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await transcriptionStore.clear();
  });

  await t.test('GET /healthz - Healthcheck Endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz'
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok' });
  });

  await t.test('POST /api/login - Valida senha abacate123', async () => {
    const resSuccess = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'abacate123' }
    });
    assert.equal(resSuccess.statusCode, 200);
    assert.equal(resSuccess.json().ok, true);

    const resFail = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'errada' }
    });
    assert.equal(resFail.statusCode, 401);
    assert.equal(resFail.json().ok, false);
  });

  await t.test('POST /api/transcricoes - Rejeita requisição não-multipart com 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcricoes',
      payload: { tipo: 'cartao-ponto' }
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().erro, /multipart/i);
  });

  await t.test('POST /api/transcricoes - Rejeita tipo inválido com 400', async () => {
    const boundary = '----TestBoundary12345';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="tipo"',
      '',
      'invalido',
      `--${boundary}`,
      'Content-Disposition: form-data; name="arquivo"; filename="doc.pdf"',
      'Content-Type: application/pdf',
      '',
      '%PDF-1.4 Mock Content',
      `--${boundary}--`
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcricoes',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().erro, /tipo/i);
  });

  await t.test('POST /api/transcricoes - Sucesso no Upload Assíncrono (202 Accepted)', async () => {
    const boundary = '----TestBoundary67890';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="tipo"',
      '',
      'cartao-ponto',
      `--${boundary}`,
      'Content-Disposition: form-data; name="arquivo"; filename="cartao.pdf"',
      'Content-Type: application/pdf',
      '',
      '%PDF-1.4 Mock PDF Content for TimeCard',
      `--${boundary}--`
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcricoes',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });

    assert.equal(res.statusCode, 202);
    const json = res.json();
    assert.ok(json.id, 'Deve retornar um ID de transcrição gerado');

    // Aguarda conclusão do job assíncrono em background
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Consulta status via GET /api/transcricoes/:id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/transcricoes/${json.id}`
    });

    assert.equal(getRes.statusCode, 200);
    const getJson = getRes.json();
    assert.equal(getJson.id, json.id);
    assert.equal(getJson.tipo, 'cartao-ponto');
    assert.ok(['processando', 'concluido', 'erro'].includes(getJson.status));
  });

  await t.test('GET /api/transcricoes/:id - Retorna 404 para ID inexistente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/transcricoes/nao_existe_123'
    });

    assert.equal(res.statusCode, 404);
    assert.match(res.json().erro, /não encontrada/i);
  });

  await t.test('PUT /api/transcricoes/:id - Atualiza transcrição com correções da UI', async () => {
    // Cria job concluído manualmente
    const job = await transcriptionStore.createJob('holerite');
    await transcriptionStore.completeJob(job.id, {
      pages: [{ page: 1, fields: [], bases: [] }]
    });

    const editedPages = {
      pages: [
        {
          page: 1,
          fields: [{ code: '101', description: 'Salário Base', reference: '30d', value: '3.500,00' }]
        }
      ]
    };

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/transcricoes/${job.id}`,
      payload: { value: editedPages }
    });

    assert.equal(putRes.statusCode, 200);
    const putJson = putRes.json();
    assert.equal(putJson.id, job.id);
    assert.deepEqual(putJson.value, editedPages);
  });

  await t.test('GET /api/transcricoes/:id/planilha - Exporta planilha em formato xlsx/csv/json', async () => {
    const job = await transcriptionStore.createJob('cartao-ponto');
    await transcriptionStore.completeJob(job.id, {
      pages: [
        {
          page: 1,
          days: [
            {
              date_raw: '01/03',
              date_formatted: '2026-03-01',
              punches: [{ time_hhmm: '08:00' }, { time_hhmm: '17:00' }],
              total_worked_hours: '09:00',
              alerts: []
            }
          ]
        }
      ]
    });

    // Teste formato CSV
    const csvRes = await app.inject({
      method: 'GET',
      url: `/api/transcricoes/${job.id}/planilha?formato=csv`
    });

    assert.equal(csvRes.statusCode, 200);
    assert.match(csvRes.headers['content-type'], /text\/csv/);
    assert.match(csvRes.headers['content-disposition'], /attachment; filename="transcricao_/);
    assert.match(csvRes.payload, /01\/03/);

    // Teste formato XLSX
    const xlsxRes = await app.inject({
      method: 'GET',
      url: `/api/transcricoes/${job.id}/planilha?formato=xlsx`
    });

    assert.equal(xlsxRes.statusCode, 200);
    assert.match(xlsxRes.headers['content-type'], /spreadsheetml/);
  });

  await t.test('GET /api/transcricoes/:id - Recupera job persistido no disco após limpeza da memória', async () => {
    const job = await transcriptionStore.createJob('holerite');
    await transcriptionStore.completeJob(job.id, { test: 'disk_persistence' });

    // Simula reinicialização do contêiner/memória sem apagar o arquivo do disco
    transcriptionStore.jobs.clear();

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/transcricoes/${job.id}`
    });

    assert.equal(getRes.statusCode, 200);
    const json = getRes.json();
    assert.equal(json.id, job.id);
    assert.equal(json.status, 'concluido');
    assert.deepEqual(json.value, { test: 'disk_persistence' });
  });
});
