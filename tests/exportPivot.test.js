import test from 'node:test';
import assert from 'node:assert/strict';
import { exportToCsv, generateExport } from '../src/utils/exportUtils.js';

test('Exportação de holerite segue o contrato pivotado', async () => {
  const job = { id: 'test-job-123', tipo: 'holerite', value: { pages: [{ page: 1, month: '04', year: '2017', fields: [
    { code: '40', label: 'Reembolso VR', value: '360,00' }, { code: '91', label: 'Hr Adic Pericul', value: '290,92' }
  ], bases: [{ label: 'Base INSS', value: '2.630,79' }] }] } };
  const csv = exportToCsv(job);
  assert.match(csv, /"Pág\.","Mês","Ano","Reembolso VR","Hr Adic Pericul"/);
  assert.match(csv, /"1","04","2017","360,00","290,92"/);
  assert.doesNotMatch(csv, /Base INSS/);
  const xlsx = await generateExport(job, 'xlsx');
  assert.equal(xlsx.filename, 'transcricao_test-job-123_holerite.xlsx');
  assert.ok(xlsx.content instanceof Buffer);
});
