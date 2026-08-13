import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIService } from '../src/services/openaiService.js';

test('ficha financeira executa IA mesmo com cobertura espacial completa', async () => {
  const service = new OpenAIService('');
  let calls = 0;
  service.generateCompletionWithFallback = async messages => {
    calls++;
    const system = messages[0].content;
    if (system.includes('agente de verbas')) {
      return JSON.stringify({ fields: [{ code: '1', label: 'Salário Base', reference: '220,00', value: '1.000,00', type: 'provento' }] });
    }
    return JSON.stringify({ bases: [], totals: { totalAdditions: '1.000,00', totalDeductions: '0,00', netValue: '1.000,00' } });
  };

  const result = await service.runFichaBlock({
    pageNum: 1,
    blockIndex: 0,
    recordKey: 'page:1:block:0',
    month: '01',
    year: '2024',
    payrollType: 'normal',
    rawText: '1 Salário Base 220,00 1.000,00\nTOT.RENDIMENTOS 1.000,00\nTOTALDESCONTOS 0,00\nSALARIOLIQUIDONOMES 1.000,00',
    items: [
      { str: '1 Salário Base', x: 10, y: 100, width: 70 },
      { str: '220,00', x: 105, y: 100, width: 35 },
      { str: '1.000,00', x: 155, y: 100, width: 45 }
    ]
  });

  assert.ok(calls > 0);
  assert.ok(result.extraction.executedPrompts > 0);
  assert.equal(result.extraction.strategy, 'FICHA_ADAPTIVE_AI');
  assert.ok(result.extraction.aiValidatedItems > 0);
});
