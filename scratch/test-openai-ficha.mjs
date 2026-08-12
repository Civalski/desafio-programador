import { openaiService } from '../src/services/openaiService.js';

async function testOpenAiFicha() {
  console.log('=== TESTANDO EXTRAÇÃO DE FICHA FINANCEIRA VIA OPENAI ===\n');

  const filePath = 'tmp/097142f1_payroll-01.pdf';
  const startTime = Date.now();
  
  const result = await openaiService.parsePayroll(filePath);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️ Extração concluída em ${duration}s.`);
  console.log(`Páginas/Blocos retornados no DTO: ${result.pages.length}`);

  console.log('\n--- SUMÁRIO DAS COMPETÊNCIAS EXTRAÍDAS ---');
  result.pages.forEach((p, idx) => {
    console.log(`[${idx + 1}] Competência: ${p.month}/${p.year} (Pág original: ${p.page}) | Verbas: ${p.fields.length} | Bases: ${p.bases.length}`);
    if (p.fields.length > 0) {
      console.log('     Primeiras verbas:', p.fields.slice(0, 3).map(f => `[${f.code}] ${f.label} (${f.type}): ${f.value}`).join(' | '));
    }
  });

  console.log('\n--- AUDITORIA DO RESULTADO ---');
  console.log(JSON.stringify(result.audit, null, 2));
}

testOpenAiFicha().catch(console.error);
