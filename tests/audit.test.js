import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server.js';
import { GeminiService } from '../src/services/geminiService.js';
import { transcriptionStore } from '../src/services/transcriptionStore.js';

test('Auditoria Adicional Opcional na Extração de Holerite', async (t) => {
  let app;
  let tempTestPdfPath;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    tempTestPdfPath = path.join(os.tmpdir(), `test_audit_${Date.now()}.pdf`);
    fs.writeFileSync(tempTestPdfPath, '%PDF-1.4 Mock Test Content');
  });

  after(async () => {
    await app.close();
    if (fs.existsSync(tempTestPdfPath)) {
      try { fs.unlinkSync(tempTestPdfPath); } catch (_) {}
    }
  });

  await t.test('POST /api/transcricoes - Aceita o campo opcional "audit"', async () => {
    transcriptionStore.clear();

    const boundary = '----AuditTestBoundary123';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="tipo"',
      '',
      'holerite',
      `--${boundary}`,
      'Content-Disposition: form-data; name="audit"',
      '',
      'true',
      `--${boundary}`,
      'Content-Disposition: form-data; name="arquivo"; filename="holerite_teste.pdf"',
      'Content-Type: application/pdf',
      '',
      '%PDF-1.4 Mock Content for Audit Test',
      `--${boundary}--`
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcricoes',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });

    assert.equal(res.statusCode, 202);
    const json = res.json();
    assert.ok(json.id);

    // Aguarda a conclusão do job assíncrono via polling com timeout
    let jobData = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/transcricoes/${json.id}`
      });
      jobData = getRes.json();
      if (jobData.status === 'concluido' || jobData.status === 'erro') break;
    }

    assert.equal(jobData.status, 'concluido');
    assert.ok(jobData.value);
  });

  await t.test('GeminiService - Fluxo de auditoria com mock do cliente Gemini', async () => {
    const customService = new GeminiService('fake-key');

    let generateContentCalls = 0;
    const callPrompts = [];

    customService.ai = {
      models: {
        generateContent: async ({ contents }) => {
          generateContentCalls++;
          const promptText = contents.find((c) => typeof c === 'string') || '';
          callPrompts.push(promptText);

          if (promptText.includes('ETAPA 3')) {
            return {
              text: JSON.stringify({
                pages: [
                  {
                    page: 1,
                    month: '05',
                    year: '2023',
                    fields: [{ code: '101', label: 'Salário Base', reference: '30d', value: '3.500,00' }]
                  }
                ]
              })
            };
          }
          if (promptText.includes('ETAPA 2')) {
            return {
              text: JSON.stringify({
                pages: [
                  {
                    page: 1,
                    month: '05',
                    year: '2023',
                    fields: [{ code: '101', label: 'Salário Base', reference: '3.500,00', value: '' }]
                  }
                ]
              })
            };
          }
          if (promptText.includes('ETAPA 1')) {
            return { text: JSON.stringify({ detectedColumns: ['code', 'label', 'reference', 'value'] }) };
          }
          return { text: '{}' };
        }
      }
    };

    // Teste 1: Auditoria Desativada (deve chamar apenas 2 etapas)
    const resultWithoutAudit = await customService.parsePayroll(tempTestPdfPath, { enableAudit: false, useMock: false });
    assert.equal(generateContentCalls, 2, 'Sem auditoria, deve chamar exatamente 2 etapas');
    assert.ok(resultWithoutAudit.pages?.[0]?.fields?.length);

    // Reset de contadores
    generateContentCalls = 0;
    callPrompts.length = 0;

    // Teste 2: Auditoria Ativada (deve chamar 3 etapas e aplicar correções da ETAPA 3)
    const resultWithAudit = await customService.parsePayroll(tempTestPdfPath, { enableAudit: true, useMock: false });
    assert.equal(generateContentCalls, 3, 'Com auditoria ativada, deve chamar 3 etapas');
    assert.ok(callPrompts.some((p) => p.includes('ETAPA 3 (Auditoria Adicional')));
    assert.equal(resultWithAudit.pages[0].fields[0].reference, '30d');
    assert.equal(resultWithAudit.pages[0].fields[0].value, '3.500,00');
  });

  await t.test('GeminiService - Resiliência a falhas/timeouts na ETAPA 3', async () => {
    const customService = new GeminiService('fake-key');

    customService.ai = {
      models: {
        generateContent: async ({ contents }) => {
          const promptText = contents.find((c) => typeof c === 'string') || '';
          if (promptText.includes('ETAPA 3')) {
            throw new Error('Simulated API Error in Stage 3');
          }
          if (promptText.includes('ETAPA 2')) {
            return {
              text: JSON.stringify({
                pages: [{ page: 1, month: '01', year: '2023', fields: [{ code: '001', label: 'Horas Extras', value: '150,00' }] }]
              })
            };
          }
          if (promptText.includes('ETAPA 1')) {
            return { text: JSON.stringify({ detectedColumns: ['code', 'label', 'value'] }) };
          }
          return { text: '{}' };
        }
      }
    };

    const result = await customService.parsePayroll(tempTestPdfPath, { enableAudit: true, useMock: false });

    // Mesmo que a ETAPA 3 lance erro, a extração da ETAPA 2 deve ser preservada sem quebrar
    assert.ok(result.pages?.[0]?.fields?.length);
    assert.equal(result.pages[0].fields[0].label, 'Horas Extras');
  });
});
