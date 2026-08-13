import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveBatches, assertPromptBatch, normalizeExtractionMetrics } from '../src/utils/adaptivePromptPlanner.js';
import { auditGlobalPayroll } from '../src/utils/validationUtils.js';

const targets = count => Array.from({ length: count }, (_, index) => ({ code: String(index + 1), evidence: `${index + 1} VERBA 1,00` }));

test('planejador limita lotes de 7, 13 e 24 itens a no máximo 6', () => {
  assert.deepEqual(createAdaptiveBatches(targets(7)).map(batch => batch.targetCount), [6, 1]);
  assert.deepEqual(createAdaptiveBatches(targets(13)).map(batch => batch.targetCount), [6, 6, 1]);
  assert.deepEqual(createAdaptiveBatches(targets(24)).map(batch => batch.targetCount), [6, 6, 6, 6]);
});

test('barreira rejeita prompt sem contexto ou acima de seis alvos', () => {
  assert.throws(() => assertPromptBatch({ id: 'x', kind: 'fields', reason: 'gap', recordKey: 'r', region: 'p1', strategy: 'recovery', targetCount: 7, payloadChars: 10 }), /TARGET_LIMIT/);
  assert.throws(() => assertPromptBatch({ id: 'x', kind: 'fields', reason: 'gap', targetCount: 1, payloadChars: 10 }), /CONTEXT_REQUIRED/);
});

test('métricas legadas não exibem 0/0 quando há itens determinísticos', () => {
  assert.deepEqual(normalizeExtractionMetrics({ expectedCount: 0, localItems: 20, executedPrompts: 0 }), {
    visibleItems: 20, deterministicItems: 20, aiRecoveredItems: 0, pendingItems: 0,
    coverage: 1, plannedBatches: 0, executedPrompts: 0, strategy: null
  });
});

test('competência igual com tipos diferentes é repetição legítima', () => {
  const audit = auditGlobalPayroll({ pages: [
    { page: 1, month: '10', year: '2017', payrollType: 'normal', recordKey: 'normal-1' },
    { page: 1, month: '10', year: '2017', payrollType: 'plr', recordKey: 'plr-1' }
  ] });
  assert.equal(audit.status, 'ok');
  assert.equal(audit.duplicates.length, 0);
  assert.deepEqual(audit.legitimateRepeatedCompetencies[0].payrollTypes, ['normal', 'plr']);
});

test('mesma competência e tipo em blocos distintos exige revisão', () => {
  const audit = auditGlobalPayroll({ pages: [
    { page: 1, month: '10', year: '2017', payrollType: 'normal', recordKey: 'a' },
    { page: 2, month: '10', year: '2017', payrollType: 'normal', recordKey: 'b' }
  ] });
  assert.equal(audit.status, 'review_required');
  assert.ok(audit.duplicates.length > 0);
});
