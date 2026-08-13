import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayrollInventory, planPayrollPromptBatches, auditPayrollCoverage, reconcilePayrollExtractions } from '../src/utils/payrollInventory.js';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { exportToCsv } from '../src/utils/exportUtils.js';
import { extractBlockDataLocal } from '../src/utils/fichaFinanceiraSegmenter.js';

test('inventário exige códigos e campos de resumo visíveis', () => {
  const text = '10 Salário Base | 220,00 | 3.000,00\n91 INSS | 11,00 | 330,00\nREMUNERAÇÃO MÊS 3.000,00\nBASE DE CÁLCULO DO INSS 3.000,00\nTOTAL DESCONTOS 330,00';
  const inventory = buildPayrollInventory(text, { sourcePage: 1 });
  assert.deepEqual(inventory.expectedCodes.map(item => item.code), ['10', '91']);
  assert.ok(inventory.expectedSummaryLabels.includes('Remuneração do Mês'));
  const audit = auditPayrollCoverage(inventory, { fields: [{ code: '10', label: 'Salário Base', value: '3.000,00' }], bases: [] });
  assert.equal(audit.valid, false);
  assert.deepEqual(audit.missingCodes.map(item => item.code), ['91']);
});

test('quantidade de prompts cresce conforme a quantidade de códigos do demonstrativo', () => {
  const sparse = planPayrollPromptBatches({ expectedCodes: Array.from({ length: 4 }, (_, index) => ({ code: String(index) })) });
  const dense = planPayrollPromptBatches({ expectedCodes: Array.from({ length: 24 }, (_, index) => ({ code: String(index) })) });
  assert.equal(sparse.plannedPrompts, 2);
  assert.equal(dense.plannedPrompts, 5);
  assert.ok(dense.fieldBatches.every(batch => batch.length <= 6));
});

test('reconciliação preserva evidência determinística e completa lacunas da IA', () => {
  const result = reconcilePayrollExtractions(
    { fields: [{ code: '10', label: 'Salário Base', value: '3.000,00', evidenceType: 'text' }], bases: [{ label: 'Base INSS', value: '3.000,00' }] },
    { fields: [{ code: '10', label: 'Salário Base', value: '3.000,00' }, { code: '91', label: 'INSS', value: '330,00' }] },
    { sourcePage: 2, sourceRegion: 'left' }
  );
  assert.equal(result.fields.length, 2);
  assert.equal(result.fields[0].evidenceType, 'text');
  assert.equal(result.fields[1].sourcePage, 2);
});

test('conflitos da mesma competência viram ocorrências exportáveis sem sobrescrita', () => {
  const normalized = normalizePayrollResponse({ pages: [
    { page: 1, month: '01', year: '2024', fields: [{ code: '10', label: 'Salário', value: '1.000,00', sourcePage: 1 }] },
    { page: 2, month: '01', year: '2024', fields: [{ code: '10', label: 'Salário', value: '500,00', sourcePage: 2 }] }
  ] });
  assert.equal(normalized.pages.length, 1);
  assert.equal(normalized.pages[0].fields.length, 2);
  assert.equal(normalized.pages[0].fields[1].occurrence, 2);
  const csv = exportToCsv({ id: 'x', tipo: 'holerite', value: normalized });
  assert.match(csv, /Salário — ocorrência 2\/pág\. 2/);
  assert.match(csv, /1\.000,00/);
  assert.match(csv, /500,00/);
});

test('normalização preserva dados cadastrais e metadados de evidência', () => {
  const normalized = normalizePayrollResponse({ pages: [{
    page: 1, month: '01', year: '2024', company: { name: 'Empresa' }, employee: { name: 'Pessoa' }, bankInfo: { bank: '001' },
    fields: [{ code: '10', label: 'Salário', reference: '220', value: '1.000,00', confidence: 0.98, evidenceType: 'text' }]
  }] });
  assert.equal(normalized.pages[0].company.name, 'Empresa');
  assert.equal(normalized.pages[0].employee.name, 'Pessoa');
  assert.equal(normalized.pages[0].fields[0].confidence, 0.98);
});

test('extrator determinístico não descarta Salário Base pelo prefixo SAL', () => {
  const items = [
    { str: '1 Salário Base', x: 10, y: 100, width: 70 },
    { str: '220,00', x: 105, y: 100, width: 35 },
    { str: '3.000,00', x: 155, y: 100, width: 45 },
    { str: '511 INSS Normal', x: 260, y: 100, width: 75 },
    { str: '11,00', x: 350, y: 100, width: 30 },
    { str: '330,00', x: 395, y: 100, width: 40 }
  ];
  const result = extractBlockDataLocal(items);
  const salary = result.fields.find(field => field.code === '1');
  assert.equal(salary?.label, 'Salário Base');
  assert.equal(salary?.value, '3.000,00');
});
