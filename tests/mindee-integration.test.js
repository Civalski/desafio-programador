import test from 'node:test';
import assert from 'node:assert/strict';
import { config, validateEnv } from '../src/config/env.js';
import { mindeeService } from '../src/services/mindeeService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

test('Mindee Environment Configuration', () => {
  assert.equal(validateEnv(), true, 'Deve validar a presença da variável MINDEE_API');
  assert.ok(config.mindeeApiKey.length > 0, 'Chave de API do Mindee não deve ser vazia');
});

test('Mindee Service Client Readiness', () => {
  assert.equal(mindeeService.isReady(), true, 'MindeeService deve estar inicializado e pronto');
  assert.ok(mindeeService.getClient() !== null, 'Cliente Mindee SDK não deve ser nulo');
});

test('Input Documents Mapping Helper', () => {
  const docs = listInputDocuments();
  assert.equal(docs.exists, true, 'Diretório data_input deve existir');
  assert.ok(docs.categories.payroll.length >= 1, 'Deve encontrar pelo menos 1 documento de payroll');
  assert.ok(docs.categories.time_card.length >= 1, 'Deve encontrar pelo menos 1 documento de time_card');
});
