import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PDFExtract } from 'pdf.js-extract';
import { transcriptionStore } from '../src/services/transcriptionStore.js';
import { segmentAllMonthBlocks } from '../src/utils/fichaFinanceiraSegmenter.js';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { validateFichaExtraction } from '../src/services/openaiService.js';

test('persiste vários blocos da mesma página sem sobrescrever resultados', async () => {
  await transcriptionStore.clear();
  const job = await transcriptionStore.createJob('holerite');
  for (let blockIndex = 0; blockIndex < 6; blockIndex++) {
    const value = { page: 1, blockIndex, resultKey: `page:1:block:${blockIndex}`, month: String(blockIndex + 1).padStart(2, '0'), year: '2024', fields: [{ code: String(blockIndex), label: 'Verba', value: '1,00' }], bases: [] };
    await transcriptionStore.saveResult(job.id, value.resultKey, value);
  }
  assert.equal((await transcriptionStore.getCompletedResultKeys(job.id)).length, 6);
  assert.equal((await transcriptionStore.getCheckpointResults(job.id)).length, 6);
});

test('resultado final normalizado é separado dos checkpoints', async () => {
  await transcriptionStore.clear();
  const job = await transcriptionStore.createJob('holerite');
  const checkpoint = { page: 1, blockIndex: 0, resultKey: 'page:1:block:0', month: '01', year: '2024', fields: [{ code: '1', label: 'Salário', value: '10,00' }], bases: [] };
  await transcriptionStore.saveResult(job.id, checkpoint.resultKey, checkpoint);
  const normalized = normalizePayrollResponse({ pages: [checkpoint] });
  await transcriptionStore.completeJob(job.id, normalized);
  const completed = await transcriptionStore.getJob(job.id);
  assert.equal(completed.status, 'concluido');
  assert.equal(completed.value.pages.length, 1);
  assert.deepEqual(await transcriptionStore.getCompletedResultKeys(job.id), ['page:1:block:0']);
});

test('validação detecta códigos e rodapé ausentes e aprova cobertura completa', () => {
  const rawText = '1 Salário | 100,00\n2 INSS | 10,00\nTOT.RENDIMENTOS 100,00\nBASEDECALCULODOINSS 100,00';
  const incomplete = validateFichaExtraction(rawText, { fields: [{ code: '1' }], totals: {}, bases: [] });
  assert.equal(incomplete.valid, false);
  assert.deepEqual(incomplete.missingCodes, ['2']);
  const complete = validateFichaExtraction(rawText, { fields: [{ code: '1' }, { code: '2' }], totals: { totalAdditions: '100,00' }, bases: [{ label: 'Base INSS', value: '100,00' }] });
  assert.equal(complete.valid, true);
});

test('holerite-1 contém 30 blocos com chaves únicas antes da normalização', async () => {
  const pdfExtract = new PDFExtract();
  const document = await pdfExtract.extract(path.resolve('exemplos', 'holerite-1.pdf'), {});
  const blocks = segmentAllMonthBlocks(document.pages);
  const keys = blocks.map(block => `page:${block.pageNum}:block:${block.blockIndex}`);
  assert.equal(blocks.length, 30);
  assert.equal(new Set(keys).size, 30);
});
