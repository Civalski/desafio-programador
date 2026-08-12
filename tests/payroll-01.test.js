import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { geminiService } from '../src/services/geminiService.js';
import { config } from '../src/config/env.js';

test('Validação Específica de Extração - payroll-01.pdf', async () => {
  const filePath = path.resolve(config.dataInputDir, 'payroll/payroll-01.pdf');
  
  // Executa o parsing com Gemini (ou mock em fallback)
  const result = await geminiService.parsePayroll(filePath, { useMock: false });

  assert.ok(result, 'Resultado não deve ser nulo ou indefinido');
  assert.ok(Array.isArray(result.pages), 'Resultado deve conter a propriedade "pages" como Array');
  assert.ok(result.pages.length >= 1, 'Deve conter pelo menos 1 página extraída');

  const page1 = result.pages[0];
  assert.ok(page1.fields, 'Página 1 deve conter verbas (fields)');
  assert.ok(page1.bases, 'Página 1 deve conter totais/bases (bases)');
  assert.ok(page1.fields.length >= 5, `Página 1 deve conter verbas extraídas do PDF (encontrado ${page1.fields.length})`);

  // Verifica que NENHUMA verba contém o mock fake antigo ("Salário Base", "Horas Extras 50%")
  const hasOldFakeVerba = page1.fields.some(f => f.label === 'Salário Base' || f.label === 'Horas Extras 50%');
  assert.equal(hasOldFakeVerba, false, 'A extração do payroll-01.pdf NÃO deve conter as verbas genéricas do mock antigo');

  // Verifica verbas reais de payroll-01.pdf
  const verbaLabels = page1.fields.map(f => f.label.toLowerCase());
  const hasRealVerba = verbaLabels.some(l => 
    l.includes('reembolso vr') || 
    l.includes('pericul') || 
    l.includes('ext diu') || 
    l.includes('seguro vida') ||
    l.includes('vale transp') ||
    l.includes('smart') ||
    l.includes('inss')
  );
  assert.ok(hasRealVerba, 'Deve conter pelo menos uma das verbas reais impressas no payroll-01.pdf');

  console.log('\n✅ [TEST PASSED] Extração do payroll-01.pdf validada com sucesso:');
  console.log(`   - Páginas extraídas: ${result.pages.length}`);
  console.log(`   - Competência Pág 1: ${page1.month}/${page1.year}`);
  console.log(`   - Verbas (fields) Pág 1: ${page1.fields.length}`);
  console.log(`   - Totais/Bases (bases) Pág 1: ${page1.bases.length}`);
  console.log('   - Amostra de Verbas Reais:', page1.fields.slice(0, 4).map(f => `${f.code} - ${f.label}: ${f.value}`));
});
