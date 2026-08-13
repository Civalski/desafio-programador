import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';

test('unifica páginas complementares da mesma competência por padrão', () => {
  const result = normalizePayrollResponse({ pages: [
    { page: 1, month: '02', year: '2018', items: [
      { code: '10', label: 'Salário Base', value: '3.000,00' },
      { code: '40', label: 'Reembolso VR', reference: '0,00', value: '' },
      { label: 'Base INSS', value: '3.000,00' }
    ] },
    { page: 2, month: '02', year: '2018', items: [
      { code: '40', label: 'Reembolso VR', reference: '0,00', value: '360,00' },
      { code: '50', label: 'Horas Extras 50%', value: '250,00' },
      { label: 'Valor Líquido', value: '3.110,00' }
    ] }
  ] });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].month, '02');
  assert.equal(result.pages[0].year, '2018');
  assert.equal(result.pages[0].fields.length, 3);
  assert.equal(result.pages[0].fields.find(field => field.code === '40').value, '360,00');
  assert.equal(result.pages[0].bases.length, 2);
});

test('preserva páginas separadas quando a unificação é desabilitada explicitamente', () => {
  const result = normalizePayrollResponse({ pages: [
    { page: 1, month: '02', year: '2018', items: [{ code: '10', label: 'Salário', value: '3.000,00' }] },
    { page: 2, month: '02', year: '2018', items: [{ code: '40', label: 'Reembolso', value: '360,00' }] }
  ] }, { unifyCompetencies: false });
  assert.equal(result.pages.length, 2);
});

test('unifica tipos de folha e preserva ocorrências divergentes em ordem documental', () => {
  const result = normalizePayrollResponse({ pages: [
    { page: 1, blockIndex: 0, recordKey: 'a', month: '12', year: '2024', payrollType: 'normal', fields: [{ code: '10', label: 'Salário', value: '1.000,00' }] },
    { page: 1, blockIndex: 1, recordKey: 'b', month: '12', year: '2024', payrollType: 'plr', fields: [{ code: '10', label: 'Salário', value: '500,00' }] },
    { page: 2, blockIndex: 0, recordKey: 'c', month: '12', year: '2024', payrollType: 'historico_13', fields: [{ code: '10', label: 'Salário', value: '500,00' }] }
  ] });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].payrollType, 'unified');
  assert.deepEqual(result.pages[0].sourcePayrollTypes, ['normal', 'plr', 'historico_13']);
  assert.deepEqual(result.pages[0].fields.map(field => ({ occurrence: field.occurrence, value: field.value })), [
    { occurrence: 1, value: '1.000,00' },
    { occurrence: 2, value: '500,00' }
  ]);
  assert.equal(result.audit.duplicates.length, 0);
});
