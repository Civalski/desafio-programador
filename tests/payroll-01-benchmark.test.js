import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import { parseGroundTruth, runBenchmark } from '../scripts/benchmark-payroll01.js';
import { segmentAllMonthBlocks, extractBlockDataLocal } from '../src/utils/fichaFinanceiraSegmenter.js';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { OpenAIService } from '../src/services/openaiService.js';

test('Suíte de Benchmark - payroll-01.pdf vs Ground Truth Auditado', async () => {
  const gtPath = path.resolve('tests/fixtures/payroll-01-audit.txt');
  const pdfPath = path.resolve('exemplos', 'holerite-1.pdf');

  // 1. Carrega Ground Truth
  const gtBlocks = parseGroundTruth(gtPath);
  assert.ok(Array.isArray(gtBlocks), 'Ground Truth deve ser uma array de blocos mensais');
  assert.equal(gtBlocks.length, 5, 'Ground Truth deve conter 5 meses auditados (04/17, 05/17, 06/17, 07/17, 12/17)');
  assert.ok(gtBlocks.every(block => block.items.length > 0), 'Ground Truth não pode usar meses vazios que mascaram perda de verbas');
  assert.ok(gtBlocks.every(block => block.bases.remuneracao_mes !== null), 'Ground Truth deve auditar remuneração mensal');

  // 2. Executa o extrator espacial real contra o PDF, sem rede.
  const pdfExtract = new PDFExtract();
  const document = await pdfExtract.extract(pdfPath, {});
  const rawPages = segmentAllMonthBlocks(document.pages).map(block => ({
    page: block.pageNum,
    blockIndex: block.blockIndex,
    recordKey: block.recordKey,
    month: block.month,
    year: block.year,
    payrollType: block.payrollType,
    ...extractBlockDataLocal(block.items, { sourcePage: block.pageNum, sourceRegion: block.blockIndex })
  }));
  const aiDTO = normalizePayrollResponse({ pages: rawPages });

  // 3. Executa o Motor do Benchmark
  const benchmarkResult = runBenchmark(aiDTO, gtBlocks);

  assert.ok(typeof benchmarkResult.score10 === 'number', 'Benchmark deve gerar uma nota de 0 a 10');
  assert.ok(benchmarkResult.score10 >= 0 && benchmarkResult.score10 <= 10, 'Nota de precisão deve estar entre 0 e 10');
  assert.ok(Array.isArray(benchmarkResult.monthReports), 'Deve conter o relatório por mês');
  assert.equal(benchmarkResult.metrics.totalGtVerbas, 5, 'Benchmark precisa conter verbas auditadas reais');
  assert.equal(benchmarkResult.metrics.totalMatchedVerbas, 5, 'Todas as verbas auditadas devem ser localizadas');
  assert.equal(benchmarkResult.metrics.valueAccuracy, 100, 'Valores auditados não podem mudar de coluna');
  assert.equal(benchmarkResult.metrics.totalsBasesAccuracy, 100, 'Totais e bases auditados devem coincidir');
  assert.ok(benchmarkResult.score10 >= 9.5, `Benchmark regressivo insuficiente: ${benchmarkResult.score10}`);

  console.log('\n✅ [BENCHMARK TEST PASSED] Validação de sanidade concluída.');
});

test('benchmark mock executa a extração determinística sem depender da OpenAI', async () => {
  const service = new OpenAIService('');
  service.generateCompletionWithFallback = async () => {
    throw new Error('A OpenAI não deve ser chamada em modo mock.');
  };

  const result = await service.parsePayroll(path.resolve('exemplos', 'holerite-1.pdf'), { useMock: true });

  assert.equal(result.pages.length, 24);
  assert.equal(new Set(result.pages.map(page => `${page.month}/${page.year}`)).size, 24);
  assert.ok(result.pages.every(page => page.payrollType === 'unified'));
  assert.ok(result.pages.every(page => page.fields.length > 0));
});
