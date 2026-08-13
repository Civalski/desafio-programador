import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { config } from '../src/config/env.js';
import { OpenAIService, assertVerifiedAiExecution, hasVerifiedAiExecution, selectVerifiedAiCheckpoints } from '../src/services/openaiService.js';

test('checkpoints sem chamada de IA são invalidados e reprocessados', () => {
  const legacy = { resultKey: 'page:1', extraction: { strategy: 'SPATIAL_TEXT', executedPrompts: 0 } };
  const verified = { resultKey: 'page:2', extraction: { strategy: 'LOCAL_TEXT_AGENTIC', executedPrompts: 2 } };

  assert.equal(hasVerifiedAiExecution(legacy), false);
  assert.equal(hasVerifiedAiExecution(verified), true);
  assert.deepEqual(selectVerifiedAiCheckpoints([legacy, verified]), [verified]);
});

test('backend rejeita conclusão quando uma unidade não comprova chamada de IA', () => {
  const verified = { resultKey: 'page:1', extractionValidation: { executedPrompts: 1 } };
  assert.doesNotThrow(() => assertVerifiedAiExecution([verified]));
  assert.throws(
    () => assertVerifiedAiExecution([verified, { resultKey: 'page:2', fields: [], bases: [] }]),
    /OPENAI_REQUIRED_EXECUTION_MISSING/
  );
});

test('chamadas OpenAI usam timeout e desabilitam retries internos não observáveis', async () => {
  const service = new OpenAIService('test-key');
  let receivedOptions;
  service.client = {
    chat: {
      completions: {
        create: async (_body, options) => {
          receivedOptions = options;
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        }
      }
    }
  };

  const result = await service.generateCompletionWithFallback([
    { role: 'user', content: 'teste sem dados pessoais' }
  ]);

  assert.equal(result, '{"ok":true}');
  assert.equal(receivedOptions.timeout, config.openaiTimeoutMs);
  assert.equal(receivedOptions.maxRetries, 0);
  assert.ok(config.openaiPageConcurrency >= 1);
});

test('página escaneada usa Vision direto no ambiente de produção', async () => {
  const previous = config.environment;
  const previousProduction = config.isProduction;
  config.environment = 'production';
  config.isProduction = true;
  try {
    const service = new OpenAIService('test-key');
    let messages;
    service.generateCompletionWithFallback = async input => {
      messages = input;
      return JSON.stringify({
        competency: { month: '01', year: '2024' },
        fields: [{ code: '001', label: 'Salário', reference: '220,00', value: '1.000,00' }],
        bases: [{ label: 'Valor Líquido', value: '1.000,00' }]
      });
    };

    const result = await service.runHybridPageAgents(
      { pageNum: 1, text: '', rawContent: [] },
      { isVision: true, imageDataUrl: 'data:image/png;base64,dGVzdGU=' }
    );

    assert.equal(result.extraction.strategy, 'OPENAI_VISION_SINGLE_PASS');
    assert.ok(result.extraction.executedPrompts > 0);
    assert.ok(result.extraction.aiValidatedItems > 0);
    assert.equal(result.fields.length, 1);
    assert.equal(messages[1].content[1].type, 'image_url');
  } finally {
    config.environment = previous;
    config.isProduction = previousProduction;
  }
});

test('resultado determinístico não é aceito quando a OpenAI falha', async () => {
  const service = new OpenAIService('test-key');
  service.generateCompletionWithFallback = async () => {
    throw new Error('timeout simulado');
  };

  await assert.rejects(
    () => service.runHybridPageAgents({
      pageNum: 1,
      resultKey: 'page:1',
      text: 'Competência 01/2024\n001 Salário Base 220,00 1.000,00',
      rawContent: []
    }),
    /timeout simulado/
  );
});

test('produção rejeita explicitamente o modo mock sem chamar a OpenAI', async () => {
  const previousProduction = config.isProduction;
  config.isProduction = true;
  try {
    const service = new OpenAIService('test-key');
    await assert.rejects(
      () => service.parsePayroll(path.resolve('exemplos', 'holerite-1.pdf'), { useMock: true }),
      /OPENAI_MOCK_FORBIDDEN_IN_PRODUCTION/
    );
  } finally {
    config.isProduction = previousProduction;
  }
});
