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
