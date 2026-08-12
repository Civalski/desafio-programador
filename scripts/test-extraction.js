import { listInputDocuments } from '../src/utils/inputDocuments.js';
import { geminiService } from '../src/services/geminiService.js';
import { isValidDateString } from '../src/utils/validationUtils.js';

console.log('=== Suíte de Validação de Testes de Extração (8 PDFs) ===\n');

async function runExtractionTests() {
  const docsInfo = listInputDocuments();
  
  if (!docsInfo.exists) {
    console.error('❌ Diretório data_input não encontrado!');
    process.exit(1);
  }

  const payrollDocs = docsInfo.categories.payroll;
  const timeCardDocs = docsInfo.categories.time_card;

  console.log(`📋 Total de Holerites encontrados: ${payrollDocs.length}`);
  console.log(`⏱️ Total de Cartões de Ponto encontrados: ${timeCardDocs.length}`);
  console.log('---------------------------------------------------\n');

  let passed = 0;
  let totalTests = 0;

  // 1. Testes de Extração dos Holerites (Payroll)
  console.log('🧪 Validação de Parsing: Holerites (Payroll)');
  for (const doc of payrollDocs) {
    totalTests++;
    try {
      console.log(`\n  📄 Processando [${doc.name}]...`);
      const dto = await geminiService.parsePayroll(doc.fullPath, { useMock: true });

      if (!dto.pages || !Array.isArray(dto.pages)) {
        throw new Error('DTO inválido: propriedade "pages" deve ser uma array');
      }

      const firstPage = dto.pages[0];
      if (!firstPage) {
        throw new Error('DTO inválido: nenhuma página retornada');
      }

      if (!Array.isArray(firstPage.fields) || !Array.isArray(firstPage.bases)) {
        throw new Error('Estrutura de "fields" ou "bases" inválida');
      }

      console.log(`     ✅ DTO Válido | Páginas: ${dto.pages.length} | Competência: ${firstPage.month || 'MM'}/${firstPage.year || 'YYYY'}`);
      console.log(`     📊 Verbas (fields): ${firstPage.fields.length} itens | Totais/Bases: ${firstPage.bases.length} itens`);
      passed++;
    } catch (err) {
      console.error(`     ❌ Falha na validação de ${doc.name}:`, err.message);
    }
  }

  console.log('\n---------------------------------------------------\n');

  // 2. Testes de Extração dos Cartões de Ponto (Time Cards)
  console.log('🧪 Validação de Parsing: Cartões de Ponto (Time Cards)');
  for (const doc of timeCardDocs) {
    totalTests++;
    try {
      console.log(`\n  ⏱️ Processando [${doc.name}]...`);
      const dto = await geminiService.parseTimeCard(doc.fullPath, { useMock: true });

      if (!dto.pages || !Array.isArray(dto.pages)) {
        throw new Error('DTO inválido: propriedade "pages" deve ser uma array');
      }

      const firstPage = dto.pages[0];
      if (!firstPage || !Array.isArray(firstPage.days)) {
        throw new Error('Estrutura de "days" inválida na página 1');
      }

      let totalPunches = 0;
      firstPage.days.forEach(day => {
        if (Array.isArray(day.punches)) {
          totalPunches += day.punches.length;
        }
      });

      console.log(`     ✅ DTO Válido | Páginas: ${dto.pages.length} | Dias Mapeados: ${firstPage.days.length}`);
      console.log(`     🕒 Total de Marcadores de Ponto: ${totalPunches}`);
      passed++;
    } catch (err) {
      console.error(`     ❌ Falha na validação de ${doc.name}:`, err.message);
    }
  }

  console.log('\n===================================================');
  console.log(`🏁 Resumo dos Testes de Extração: ${passed}/${totalTests} executados com sucesso.`);
  console.log('===================================================\n');

  if (passed !== totalTests) {
    process.exit(1);
  }
}

runExtractionTests();
