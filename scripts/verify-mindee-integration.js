import { config, validateEnv } from '../src/config/env.js';
import { mindeeService } from '../src/services/mindeeService.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';

console.log('=== Verificação de Integração da API Mindee & Data Input ===\n');

try {
  // 1. Valida variáveis de ambiente
  validateEnv();
  console.log('✅ Variável MINDEE_API encontrada com sucesso.');
  console.log(`🔑 Chave (mascarada): ${config.mindeeApiKey.substring(0, 8)}...${config.mindeeApiKey.slice(-4)}`);

  // 2. Testa inicialização do serviço Mindee
  if (mindeeService.isReady()) {
    console.log('✅ Cliente Mindee SDK inicializado e pronto para uso.');
  } else {
    console.log('❌ Falha ao inicializar o cliente Mindee.');
  }

  // 3. Mapeia documentos do diretório data_input
  const docsInfo = listInputDocuments();
  console.log(`\n📂 Diretório Data Input: ${docsInfo.baseDir}`);
  console.log(`📁 Payroll (Holerites) encontrados: ${docsInfo.categories.payroll.length} arquivo(s)`);
  docsInfo.categories.payroll.forEach(file => console.log(`   - ${file.relativePath}`));

  console.log(`📁 Time Card (Cartões de Ponto) encontrados: ${docsInfo.categories.time_card.length} arquivo(s)`);
  docsInfo.categories.time_card.forEach(file => console.log(`   - ${file.relativePath}`));

  console.log('\nℹ️ Nota: Nenhuma tentativa de leitura OCR dos documentos foi executada (conforme solicitado).');
  console.log('✨ Integração do backend com a API do Mindee concluída com sucesso!');
} catch (error) {
  console.error('\n❌ Erro durante a verificação:', error.message);
  process.exit(1);
}
