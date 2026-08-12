import fs from 'fs';
import path from 'path';
import { geminiService } from '../src/services/geminiService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';
import { validateEnv } from '../src/config/env.js';

console.log('=== Fase 1: Extração de Amostra Gemini & Criação de Snapshots ===\n');

async function extractSnapshots() {
  try {
    validateEnv();
    
    if (!geminiService.isReady()) {
      throw new Error('Chave de API do Gemini inválida ou cliente não inicializado.');
    }

    const docsInfo = listInputDocuments();
    const payrollFile = docsInfo.categories.payroll[0];
    const timeCardFile = docsInfo.categories.time_card[0];

    if (!payrollFile || !timeCardFile) {
      throw new Error('Arquivos de teste (payroll e time_card) não encontrados no diretório data_input.');
    }

    const mocksDir = path.resolve(process.cwd(), 'src/mocks');
    if (!fs.existsSync(mocksDir)) {
      fs.mkdirSync(mocksDir, { recursive: true });
    }

    // 1. Extração da amostra do Holerite (1º arquivo)
    console.log(`📄 Enviando para Gemini AI: Holerite -> ${payrollFile.relativePath}`);
    const payrollRaw = await geminiService.parsePayroll(payrollFile.fullPath, { useMock: false });

    const payrollSnapshotPath = path.join(mocksDir, 'payroll-snapshot.json');
    fs.writeFileSync(payrollSnapshotPath, JSON.stringify(payrollRaw, null, 2));
    console.log(`✅ Snapshot salvo em: ${payrollSnapshotPath}`);

    // 2. Extração da amostra do Cartão de Ponto (1º arquivo)
    console.log(`\n⏱️ Enviando para Gemini AI: Cartão de Ponto -> ${timeCardFile.relativePath}`);
    const timeCardRaw = await geminiService.parseTimeCard(timeCardFile.fullPath, { useMock: false });

    const timeCardSnapshotPath = path.join(mocksDir, 'timecard-snapshot.json');
    fs.writeFileSync(timeCardSnapshotPath, JSON.stringify(timeCardRaw, null, 2));
    console.log(`✅ Snapshot salvo em: ${timeCardSnapshotPath}`);

    console.log('\n🎉 Extração de snapshots concluída com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante a geração de snapshots:', error.message);
    process.exit(1);
  }
}

extractSnapshots();
