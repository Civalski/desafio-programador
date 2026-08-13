import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/env.js';
import { OpenAIService } from '../src/services/openaiService.js';

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
    assert.equal(result.fields.length, 1);
    assert.equal(messages[1].content[1].type, 'image_url');
  } finally {
    config.environment = previous;
    config.isProduction = previousProduction;
  }
});
