import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { isNonSequentialCompetency } from '../src/utils/validationUtils.js';

test('normalizador de holerite mantém verbas, bases e totais separados', () => {
  const result = normalizePayrollResponse({ pages: [{ page: 1, month: '01', year: '2024', items: [{ code: '1', label: 'Salário', value: '1.000,00' }, { label: 'Base INSS', value: '1.000,00' }, { label: 'Total Vencimentos', value: '1.000,00' }] }] });
  assert.equal(result.pages[0].fields.length, 1);
  assert.equal(result.pages[0].bases.length, 2);
  assert.equal(isNonSequentialCompetency({ month: '12', year: '2023' }, { month: '01', year: '2024' }), false);
});
