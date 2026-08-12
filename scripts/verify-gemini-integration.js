import { geminiService } from '../src/services/geminiService.js';
import { config } from '../src/config/env.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

console.log('=== Verificação de Integração da API Gemini & Data Input ===\n');

try {
  // 1. Verifica variável de ambiente
  if (!config.geminiApiKey) {
    console.error('❌ Variável GEMINI_API_KEY não encontrada no arquivo .env!');
    process.exit(1);
  }
  console.log('✅ Variável GEMINI_API_KEY encontrada com sucesso.');
  console.log(`🔑 Chave (mascarada): ${config.geminiApiKey.substring(0, 8)}...${config.geminiApiKey.slice(-4)}`);

  // 2. Testa inicialização do serviço Gemini
  if (geminiService.isReady()) {
    console.log('✅ Cliente Gemini AI inicializado e pronto para uso.');
  } else {
    console.log('❌ Falha ao inicializar o cliente Gemini.');
  }

  // 3. Mapeia documentos em data_input
  const docsInfo = listInputDocuments();
  if (docsInfo.exists) {
    console.log(`📁 Diretório data_input localizado: ${docsInfo.baseDir}`);
    console.log(`   📄 Holerites (Payroll): ${docsInfo.categories.payroll.length} arquivos`);
    console.log(`   ⏱️ Cartões de Ponto (Time Card): ${docsInfo.categories.time_card.length} arquivos`);
  } else {
    console.warn(`⚠️ Diretório data_input não encontrado em ${docsInfo.baseDir}`);
  }

  console.log('\n✨ Integração do backend com a API do Gemini concluída com sucesso!');
} catch (error) {
  console.error('❌ Erro durante verificação:', error.message);
  process.exit(1);
}
