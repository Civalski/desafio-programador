import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptionUseCases } from '../src/application/transcriptionUseCases.js';

function makeRepository() {
  const jobs = new Map(); const checkpoints = new Map(); let sequence = 0;
  return {
    async createJob(tipo, file) { const job = { id: String(++sequence), tipo, fileName: file.name, status: 'processando', progress: {}, value: null }; jobs.set(job.id, job); return job; },
    async getJob(id) { return jobs.get(id) || null; }, async listJobs() { return [...jobs.values()]; },
    async deleteJob(id) { const job = jobs.get(id); jobs.delete(id); return job; },
    async updateJobProgress(id, update) { const job = jobs.get(id); job.progress = { ...job.progress, ...update }; return job; },
    async saveResult(id, key, value) { checkpoints.set(`${id}:${key}`, value); },
    async getCompletedResultKeys(id) { return [...checkpoints.keys()].filter(key => key.startsWith(`${id}:`)).map(key => key.slice(id.length + 1)); },
    async getCheckpointResults(id) { return [...checkpoints.entries()].filter(([key]) => key.startsWith(`${id}:`)).map(([, value]) => value); },
    async completeJob(id, value) { const job = jobs.get(id); job.status = 'concluido'; job.value = value; return job; },
    async failJob(id, error) { const job = jobs.get(id); job.status = 'erro'; job.erro = error; return job; },
    async startRetry(id) { const job = jobs.get(id); job.status = 'processando'; return job; },
    async updateJobValue(id, value) { const job = jobs.get(id); job.value = value; return job; }
  };
}

function makeUseCases({ processor } = {}) {
  const repository = makeRepository(); const documents = new Map();
  const useCases = new TranscriptionUseCases({
    transcriptionRepository: repository,
    documentStorage: { async saveDocument(job, content) { documents.set(job.id, content); }, async getDocument(job) { if (!documents.has(job.id)) throw new Error('missing'); return documents.get(job.id); } },
    documentProcessor: processor || { async parseDocument(_path, _type, options) { await options.onPageCompleted({ page: 1, resultKey: 'page:1', fields: [], bases: [] }); await options.onProgress({ percentage: 90 }); return { pages: [{ page: 1, fields: [], bases: [] }] }; } },
    exporter: { async generate(job, format) { return { content: format, contentType: 'text/plain', filename: `${job.id}.txt` }; } },
    temporaryFiles: { async withPdf(_id, _content, action) { return action('/fake/document.pdf'); } },
    pdfValidator: { async assertReadable() {} }, logger: { error() {} }
  });
  return { useCases, repository };
}

test('caso de uso cria, valida e processa uma transcrição com checkpoints', async () => {
  const { useCases, repository } = makeUseCases();
  const job = await useCases.create({ type: 'holerite', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') } });
  await useCases.process(job.id, Buffer.from('%PDF-test'));
  const completed = await repository.getJob(job.id);
  assert.equal(completed.status, 'concluido');
  assert.deepEqual(await repository.getCompletedResultKeys(job.id), ['page:1']);
});

test('caso de uso tenta novamente antes de marcar a transcrição como erro', async () => {
  let calls = 0;
  const { useCases, repository } = makeUseCases({ processor: { async parseDocument() { calls++; throw new Error('falha transitória'); } } });
  const job = await useCases.create({ type: 'holerite', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') } });
  await useCases.process(job.id, Buffer.from('%PDF-test'));
  assert.equal(calls, 2);
  assert.equal((await repository.getJob(job.id)).status, 'erro');
});

test('caso de uso retoma job e mantém o contrato de exportação', async () => {
  const { useCases, repository } = makeUseCases();
  const job = await useCases.create({ type: 'holerite', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') } });
  await repository.failJob(job.id, 'interrompido');
  const resumed = await useCases.resume(job.id);
  await resumed.process;
  const exported = await useCases.export(job.id, 'csv');
  assert.equal(resumed.job.status, 'concluido');
  assert.equal(exported.content, 'csv');
});

test('caso de uso rejeita extensão diferente de PDF antes de criar o job', async () => {
  const { useCases, repository } = makeUseCases();
  await assert.rejects(() => useCases.create({ type: 'holerite', file: { name: 'folha.txt', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') } }), /PDF válido/);
  assert.equal((await repository.listJobs()).length, 0);
});
