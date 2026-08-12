import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { auditGlobalPayroll } from '../src/utils/validationUtils.js';

test('1. Lacuna no Meio do Ano - Não deve inferir ou criar mês ausente (04/2024)', () => {
  const rawInput = {
    pages: [
      { page: 1, month: '01', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 2, month: '02', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 3, month: '03', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 4, month: '05', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 5, month: '06', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] }
    ]
  };

  const result = normalizePayrollResponse(rawInput);

  assert.equal(result.pages.length, 5, 'Deve manter exatamente as 5 páginas do documento');
  
  const extractedCompetencies = result.pages.map(p => `${p.month}/${p.year}`);
  assert.deepEqual(
    extractedCompetencies,
    ['01/2024', '02/2024', '03/2024', '05/2024', '06/2024'],
    'As competências devem corresponder estritamente ao documento original'
  );

  assert.ok(
    !extractedCompetencies.includes('04/2024'),
    'O mês 04/2024 não deve ser criado ou preenchido'
  );
  
  assert.equal(result.audit.status, 'ok', 'Não deve marcar erro apenas pela ausência de um mês intermediário');
});

test('2. Lacuna no Fim do Ano - Não deve criar 12/2024 automaticamente em transição anual', () => {
  const rawInput = {
    pages: [
      { page: 1, month: '10', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 2, month: '11', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 3, month: '01', year: '2025', items: [{ description: 'Salário Base', amount: '3.000,00' }] }
    ]
  };

  const result = normalizePayrollResponse(rawInput);

  assert.equal(result.pages.length, 3, 'Deve conter exatamente 3 páginas');

  const extractedCompetencies = result.pages.map(p => `${p.month}/${p.year}`);
  assert.deepEqual(
    extractedCompetencies,
    ['10/2024', '11/2024', '01/2025'],
    'As competências extraídas devem respeitar a lacuna sem inventar 12/2024'
  );

  assert.ok(
    !extractedCompetencies.includes('12/2024'),
    'Não deve criar 12/2024 automaticamente apenas porque os meses vizinhos existem'
  );
});

test('3. Duplicidade de Competência sem Unificação - Detectar 05/2024 duplicado e sinalizar na auditoria', () => {
  const rawInput = {
    pages: [
      { page: 1, month: '04', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 2, month: '05', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] },
      { page: 3, month: '05', year: '2024', items: [{ description: '13º Salário', amount: '1.500,00' }] },
      { page: 4, month: '06', year: '2024', items: [{ description: 'Salário Base', amount: '3.000,00' }] }
    ]
  };

  const result = normalizePayrollResponse(rawInput, { unifyCompetencies: false });

  assert.equal(result.pages.length, 4, 'Todas as 4 páginas devem ser preservadas sem exclusão cega quando unifyCompetencies=false');
  assert.equal(result.audit.status, 'review_required', 'Deve sinalizar review_required devido à duplicidade');
  assert.deepEqual(result.audit.duplicates, ['05/2024'], 'Deve identificar 05/2024 no array de duplicidades');
  assert.ok(
    result.audit.warnings.some(w => w.includes('05/2024 aparece duplicada')),
    'Deve incluir mensagem explicativa sobre a duplicidade de 05/2024'
  );
});

test('4. Preservação Fiel de Competências Explícitas no Documento', () => {
  const rawInput = {
    pages: [
      { page: 1, month: '07', year: '2023', items: [{ description: 'Horas Extras', amount: '250,00' }] },
      { page: 2, month: '08', year: '2023', items: [{ description: 'Salário Base', amount: '4.000,00' }] }
    ]
  };

  const result = normalizePayrollResponse(rawInput);

  assert.equal(result.pages[0].month, '07');
  assert.equal(result.pages[0].year, '2023');
  assert.equal(result.pages[1].month, '08');
  assert.equal(result.pages[1].year, '2023');
  assert.equal(result.audit.status, 'ok');
  assert.equal(result.audit.duplicates.length, 0);
});

test('5. Ausência de Competência - Não deve preencher fallbacks hardcoded fictícios', () => {
  const rawInput = {
    pages: [
      { page: 1, month: '', year: '', items: [{ description: 'Provento Genérico', amount: '100,00' }] }
    ]
  };

  const result = normalizePayrollResponse(rawInput);

  assert.equal(result.pages[0].month, '', 'Sem mês evidenciado, deve permanecer string vazia');
  assert.equal(result.pages[0].year, '', 'Sem ano evidenciado, deve permanecer string vazia');
  assert.equal(result.audit.status, 'review_required', 'Sinalizar auditoria para revisão');
  assert.ok(result.audit.missingEvidence.length > 0, 'Deve registrar ausência de evidência na auditoria');
});

test('6. Unificação de Páginas Complementares do Mesmo Mês (ex: duas linhas 02/2018 que se completam)', () => {
  const rawInput = {
    pages: [
      {
        page: 1,
        month: '02',
        year: '2018',
        items: [
          { code: '40', description: 'Reembolso VR', reference: '0,00', amount: '' },
          { code: '10', description: 'Salário Base', reference: '30,00', amount: '3.000,00' },
          { description: 'Base INSS', amount: '3.000,00' }
        ]
      },
      {
        page: 2,
        month: '02',
        year: '2018',
        items: [
          { code: '40', description: 'Reembolso VR', reference: '0,00', amount: '360,00' },
          { code: '50', description: 'Horas Extras 50%', reference: '10,00', amount: '250,00' },
          { description: 'Valor Líquido', amount: '3.110,00' }
        ]
      }
    ]
  };

  const result = normalizePayrollResponse(rawInput);

  assert.equal(result.pages.length, 1, 'As duas linhas de 02/2018 devem ser unificadas em uma única linha');
  assert.equal(result.pages[0].month, '02');
  assert.equal(result.pages[0].year, '2018');

  // Verifica se as verbas se completaram
  const fields = result.pages[0].fields;
  assert.equal(fields.length, 3, 'Deve conter Salário Base, Reembolso VR e Horas Extras 50%');

  const vrField = fields.find(f => f.code === '40');
  assert.ok(vrField, 'Reembolso VR deve estar presente');
  assert.equal(vrField.value, '360,00', 'O valor 360,00 da página 2 deve ter preenchido o valor que faltava na página 1');

  const baseField = fields.find(f => f.code === '10');
  assert.equal(baseField.value, '3.000,00');

  const extraField = fields.find(f => f.code === '50');
  assert.equal(extraField.value, '250,00');

  // Verifica se as bases se completaram
  const bases = result.pages[0].bases;
  assert.equal(bases.length, 2);
  assert.ok(bases.some(b => b.label === 'Base INSS' && b.value === '3.000,00'));
  assert.ok(bases.some(b => b.label === 'Valor Líquido' && b.value === '3.110,00'));
});

