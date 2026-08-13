import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { parseGroundTruth, runBenchmark } from '../scripts/benchmark-payroll01.js';
import { config } from '../src/config/env.js';

test('Suíte de Benchmark - payroll-01.pdf vs Ground Truth Auditado', async () => {
  const gtPath = path.resolve('tests/fixtures/payroll-01-audit.txt');
  const pdfPath = path.resolve(config.dataInputDir, 'holerite-1.pdf');

  // 1. Carrega Ground Truth
  const gtBlocks = parseGroundTruth(gtPath);
  assert.ok(Array.isArray(gtBlocks), 'Ground Truth deve ser uma array de blocos mensais');
  assert.equal(gtBlocks.length, 5, 'Ground Truth deve conter 5 meses auditados (04/17, 05/17, 06/17, 07/17, 12/17)');
  assert.ok(gtBlocks.every(block => block.items.length > 0), 'Ground Truth não pode usar meses vazios que mascaram perda de verbas');
  assert.ok(gtBlocks.every(block => block.bases.remuneracao_mes !== null), 'Ground Truth deve auditar remuneração mensal');

  // 2. Valida o motor sem fingir que houve uma extração da OpenAI.
  assert.ok(pdfPath.endsWith('holerite-1.pdf'));
  const aiDTO = { pages: gtBlocks.map(block => ({ month: block.month, year: block.year, fields: [], bases: [] })) };

  // 3. Executa o Motor do Benchmark
  const benchmarkResult = runBenchmark(aiDTO, gtBlocks);

  assert.ok(typeof benchmarkResult.score10 === 'number', 'Benchmark deve gerar uma nota de 0 a 10');
  assert.ok(benchmarkResult.score10 >= 0 && benchmarkResult.score10 <= 10, 'Nota de precisão deve estar entre 0 e 10');
  assert.ok(Array.isArray(benchmarkResult.monthReports), 'Deve conter o relatório por mês');

  console.log('\n✅ [BENCHMARK TEST PASSED] Validação de sanidade concluída.');
});
