import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiService } from '../src/services/openaiService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

test('Holerites de exemplo respeitam o schema', async () => {
  const docs = listInputDocuments().categories.payroll;
  assert.equal(docs.length, 4);
  for (const doc of docs) {
    const dto = await openaiService.parsePayroll(doc.fullPath, { useMock: true });
    assert.ok(Array.isArray(dto.pages));
    assert.ok(Array.isArray(dto.pages[0].fields));
    assert.ok(Array.isArray(dto.pages[0].bases));
  }
});
