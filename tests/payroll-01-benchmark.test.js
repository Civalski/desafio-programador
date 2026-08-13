import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { parseGroundTruth, runBenchmark } from '../scripts/benchmark-payroll01.js';
import { openaiService } from '../src/services/openaiService.js';
import { config } from '../src/config/env.js';

test('Suíte de Benchmark - payroll-01.pdf vs Ground Truth Auditado', async () => {
  const gtPath = path.resolve('tests/fixtures/payroll-01-audit.txt');
  const pdfPath = path.resolve(config.dataInputDir, 'holerite-1.pdf');

  // 1. Carrega Ground Truth
  const gtBlocks = parseGroundTruth(gtPath);
  assert.ok(Array.isArray(gtBlocks), 'Ground Truth deve ser uma array de blocos mensais');
  assert.equal(gtBlocks.length, 5, 'Ground Truth deve conter 5 meses auditados (04/17, 05/17, 06/17, 07/17, 12/17)');

  // 2. Executa IA no documento (sem passar Ground Truth para a IA)
  // Utiliza mock no teste automatizado se APIs não estiverem configuradas ou useMock habilitado
  const aiDTO = await openaiService.parsePayroll(pdfPath, { useMock: true });
  assert.ok(aiDTO && Array.isArray(aiDTO.pages), 'AI DTO deve conter páginas extraídas');

  // 3. Executa o Motor do Benchmark
  const benchmarkResult = runBenchmark(aiDTO, gtBlocks);

  assert.ok(typeof benchmarkResult.score10 === 'number', 'Benchmark deve gerar uma nota de 0 a 10');
  assert.ok(benchmarkResult.score10 >= 0 && benchmarkResult.score10 <= 10, 'Nota de precisão deve estar entre 0 e 10');
  assert.ok(Array.isArray(benchmarkResult.monthReports), 'Deve conter o relatório por mês');

  console.log('\n✅ [BENCHMARK TEST PASSED] Validação de sanidade concluída.');
});
