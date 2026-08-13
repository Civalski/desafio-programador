import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportToCsv, generateExport } from '../src/utils/exportUtils.js';

test('Exportação de holerite segue o contrato pivotado', async () => {
  const job = { id: 'test-job-123', tipo: 'holerite', value: { pages: [{ page: 1, month: '04', year: '2017', fields: [
    { code: '40', label: 'Reembolso VR', value: '360,00' }, { code: '91', label: 'Hr Adic Pericul', value: '290,92' }
  ], bases: [{ label: 'Base INSS', value: '2.630,79' }] }] } };
  const csv = exportToCsv(job);
  assert.match(csv, /"Pág\.","Bloco","Mês","Ano","Tipo da folha","Revisão","Observações","Empresa","CNPJ","Funcionário"/);
  assert.match(csv, /"Reembolso VR","Reembolso VR — Referência","Hr Adic Pericul","Hr Adic Pericul — Referência","Base INSS"/);
  assert.match(csv, /"360,00","","290,92","","2.630,79"/);
  const xlsx = await generateExport(job, 'xlsx');
  assert.equal(xlsx.filename, 'transcricao_test-job-123_holerite.xlsx');
  assert.ok(xlsx.content instanceof Buffer);
});

test('CSV e XLSX preservam verbas e bases numeradas na mesma linha', async () => {
  const job = { id: 'occurrences', tipo: 'holerite', value: { pages: [{ page: 1, month: '12', year: '2024', payrollType: 'unified', fields: [
    { code: '10', label: 'Salário', canonicalKey: 'field:code:10', occurrence: 1, reference: '220', value: '1.000,00' },
    { code: '10', label: 'Salário', canonicalKey: 'field:code:10', occurrence: 2, reference: '10', value: '500,00' }
  ], bases: [
    { label: 'Valor Líquido', canonicalKey: 'base:valor_liquido', occurrence: 1, value: '900,00' },
    { label: 'Valor Líquido', canonicalKey: 'base:valor_liquido', occurrence: 2, value: '450,00' }
  ] }] } };
  const csv = exportToCsv(job);
  assert.match(csv, /"Salário 2","Salário 2 — Referência"/);
  assert.match(csv, /"Valor Líquido","Valor Líquido 2"/);
  assert.match(csv, /"1\.000,00","220","500,00","10","900,00","450,00"/);

  const exported = await generateExport(job, 'xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exported.content);
  const headers = workbook.getWorksheet('Holerite').getRow(1).values;
  assert.ok(headers.includes('Salário 2'));
  assert.ok(headers.includes('Valor Líquido 2'));
});
