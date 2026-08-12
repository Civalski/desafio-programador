import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimeCardResponse } from '../src/normalizers/timeCardNormalizer.js';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { isValidDateString, normalizeTimeHHMM, formatMoneyString, hasOddPunches } from '../src/utils/validationUtils.js';
import { openaiService } from '../src/services/openaiService.js';

test('Validation Utils - Dates, Times, and Formatting', () => {
  // Teste de validação de datas
  assert.equal(isValidDateString('21/05/2019'), true, 'Data válida deve retornar true');
  assert.equal(isValidDateString('38/07/2019'), false, 'Data impossível (dia 38) deve retornar false');
  assert.equal(isValidDateString('15/13/2020'), false, 'Mês impossível (mês 13) deve retornar false');
  assert.equal(isValidDateString('0?/05/2019'), false, 'Data com caractere incerto deve retornar false');

  // Teste de normalização HH:MM
  assert.equal(normalizeTimeHHMM('08:25'), '08:25');
  assert.equal(normalizeTimeHHMM('8:5'), '08:05');
  assert.equal(normalizeTimeHHMM('0825'), '08:25');
  assert.equal(normalizeTimeHHMM('0?:25'), '0?:25');

  // Teste de formatação monetária
  assert.equal(formatMoneyString('2.389,77'), '2.389,77');
  assert.equal(formatMoneyString(2389.77), '2.389,77');

  // Batidas ímpares
  assert.equal(hasOddPunches([{ kind: 'IN' }]), true);
  assert.equal(hasOddPunches([{ kind: 'IN' }, { kind: 'OUT' }]), false);
});

test('Time Card Normalizer DTO Schema', () => {
  const rawData = {
    pages: [
      {
        pageNumber: 1,
        days: [
          {
            date_raw: '21/05/2019',
            punches: [
              { kind: 'IN', time_raw: '08:25' },
              { kind: 'OUT', time_raw: '18:25' }
            ]
          },
          {
            date_raw: '38/07/2019', // Data impossível
            punches: [
              { time_raw: '09:00' } // Sem kind explícito (deve inferir IN)
            ]
          }
        ]
      }
    ]
  };

  const dto = normalizeTimeCardResponse(rawData);

  assert.ok(dto.pages, 'DTO deve conter a chave pages');
  assert.equal(dto.pages.length, 1);
  assert.equal(dto.pages[0].page, 1);
  assert.equal(dto.pages[0].days.length, 2);

  // Primeiro dia
  const day1 = dto.pages[0].days[0];
  assert.equal(day1.date_raw, '21/05/2019');
  assert.equal(day1.punches.length, 2);
  assert.equal(day1.punches[0].kind, 'IN');
  assert.equal(day1.punches[0].time_hhmm, '08:25');
  assert.equal(day1.punches[1].kind, 'OUT');

  // Segundo dia (com data impossível tratada com ?)
  const day2 = dto.pages[0].days[1];
  assert.equal(day2.date_raw, '??/??/????');
  assert.equal(day2.punches[0].kind, 'IN');
  assert.equal(day2.punches[0].time_hhmm, '09:00');
});

test('Payroll Normalizer DTO Schema - Separation of Fields and Bases', () => {
  const rawData = {
    pages: [
      {
        pageNumber: 1,
        year: '2020',
        month: '1',
        items: [
          { code: '0010', label: 'Salário Base', reference: '220,00', value: '2.389,77' },
          { code: '0998', label: 'INSS', reference: '', value: '262,87' },
          { label: 'Base INSS', value: '2.545,68' },
          { label: 'Total Vencimentos', value: '2.545,68' },
          { label: 'Valor Líquido', value: '2.282,81' }
        ]
      }
    ]
  };

  const dto = normalizePayrollResponse(rawData);

  assert.ok(dto.pages);
  assert.equal(dto.pages[0].year, '2020');
  assert.equal(dto.pages[0].month, '01'); // Mês formatado com 2 dígitos

  // Fields (verbas)
  assert.equal(dto.pages[0].fields.length, 2);
  assert.equal(dto.pages[0].fields[0].code, '0010');
  assert.equal(dto.pages[0].fields[0].label, 'Salário Base');
  assert.equal(dto.pages[0].fields[0].value, '2.389,77');

  // Bases (totais e bases)
  assert.equal(dto.pages[0].bases.length, 3);
  assert.equal(dto.pages[0].bases[0].label, 'Base INSS');
  assert.equal(dto.pages[0].bases[0].value, '2.545,68');
  assert.equal(dto.pages[0].bases[2].label, 'Valor Líquido');
  assert.equal(dto.pages[0].bases[2].value, '2.282,81');
});

test('OpenAIService Parse Document Routing', async () => {
  assert.ok(typeof openaiService.parseTimeCard === 'function');
  assert.ok(typeof openaiService.parsePayroll === 'function');
  assert.ok(typeof openaiService.parseDocument === 'function');
});
