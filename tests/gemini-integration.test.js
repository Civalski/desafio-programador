import test from 'node:test';
import assert from 'node:assert/strict';
import { config, validateEnv } from '../src/config/env.js';
import { geminiService } from '../src/services/geminiService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

test('Gemini Environment Configuration', () => {
  assert.equal(validateEnv(), true, 'Deve validar a presença da variável GEMINI_API_KEY');
  assert.ok(config.geminiApiKey.length > 0, 'Chave de API do Gemini não deve ser vazia');
});

test('Gemini Service Client Readiness', () => {
  assert.equal(geminiService.isReady(), true, 'GeminiService deve estar inicializado e pronto');
  assert.ok(geminiService.getClient() !== null, 'Cliente Gemini AI não deve ser nulo');
});

test('Input Documents Mapping Helper', () => {
  const docs = listInputDocuments();
  assert.equal(docs.exists, true, 'Diretório data_input deve existir');
  assert.ok(docs.categories.payroll.length >= 1, 'Deve encontrar pelo menos 1 documento de payroll');
  assert.ok(docs.categories.time_card.length >= 1, 'Deve encontrar pelo menos 1 documento de time_card');
});
