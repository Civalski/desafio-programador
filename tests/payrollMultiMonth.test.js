import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';

test('Validação de Alinhamento de Colunas e Agrupamento por Mês', () => {
  const rawInput = {
    pages: [
      {
        page: 1,
        month: '04',
        year: '2017',
        items: [
          // Item A: com referência e valor
          { code: '40', description: 'Reembolso VR', reference: '0,00', amount: '360,00' },
          // Item B: apenas valor, porém retornado em 'reference' por falha de parser
          { code: '100', description: 'Salário Base', reference: '2.500,00', amount: '' },
          // Item C: Base de cálculo
          { description: 'Base INSS', amount: '2.500,00' }
        ]
      },
      {
        page: 2,
        month: '05',
        year: '2017',
        items: [
          { code: '40', description: 'Reembolso VR', reference: '0,00', amount: '360,00' }
        ]
      }
    ]
  };

  const normalized = normalizePayrollResponse(rawInput);

  assert.equal(normalized.pages.length, 2);
  assert.equal(normalized.pages[0].month, '04');
  assert.equal(normalized.pages[0].year, '2017');

  const fieldsP1 = normalized.pages[0].fields;
  // Item B deve ter o valor '2.500,00' corrigido para a coluna 'value', limpando 'reference'
  const salarioItem = fieldsP1.find(f => f.code === '100');
  assert.ok(salarioItem, 'Salário base deve estar presente nas verbas');
  assert.equal(salarioItem.value, '2.500,00', 'O valor do salário deve estar na propriedade "value"');
  assert.equal(salarioItem.reference, '', 'A referência deve ficar limpa para itens sem quantidade/dias');

  // Página 2 (mês 05)
  assert.equal(normalized.pages[1].month, '05');
  assert.equal(normalized.pages[1].year, '2017');
});
