import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiService } from '../src/services/geminiService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

test('Extraction Test Suite - All 8 Input Documents Schema Validation', async (t) => {
  const docsInfo = listInputDocuments();
  assert.equal(docsInfo.exists, true, 'Diretório data_input deve existir');

  const payrollDocs = docsInfo.categories.payroll;
  const timeCardDocs = docsInfo.categories.time_card;

  assert.equal(payrollDocs.length, 4, 'Devem existir 4 holerites de teste');
  assert.equal(timeCardDocs.length, 4, 'Devem existir 4 cartões de ponto de teste');

  await t.test('Holerites (Payroll) DTO Schema', async () => {
    for (const doc of payrollDocs) {
      const dto = await geminiService.parsePayroll(doc.fullPath, { useMock: true });
      assert.ok(dto.pages, `DTO de ${doc.name} deve conter array pages`);
      assert.ok(Array.isArray(dto.pages));
      assert.ok(dto.pages.length > 0);
      assert.ok(Array.isArray(dto.pages[0].fields));
      assert.ok(Array.isArray(dto.pages[0].bases));
    }
  });

  await t.test('Cartões de Ponto (Time Cards) DTO Schema', async () => {
    for (const doc of timeCardDocs) {
      const dto = await geminiService.parseTimeCard(doc.fullPath, { useMock: true });
      assert.ok(dto.pages, `DTO de ${doc.name} deve conter array pages`);
      assert.ok(Array.isArray(dto.pages));
      assert.ok(dto.pages.length > 0);
      assert.ok(Array.isArray(dto.pages[0].days));
    }
  });
});
