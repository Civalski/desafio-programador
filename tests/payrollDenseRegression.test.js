import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PDFExtract } from 'pdf.js-extract';
import { segmentAllMonthBlocks, extractBlockDataLocal } from '../src/utils/fichaFinanceiraSegmenter.js';
import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';
import { buildCanonicalColumnRegistry, canonicalizePayrollItem } from '../src/utils/payrollCanonical.js';

async function auditedExtraction() {
  const pdfExtract = new PDFExtract();
  const document = await pdfExtract.extract(path.resolve('exemplos', 'holerite-1.pdf'), {});
  const blocks = segmentAllMonthBlocks(document.pages);
  const rawPages = blocks.map(block => ({
    page: block.pageNum,
    blockIndex: block.blockIndex,
    recordKey: block.recordKey,
    sourcePages: block.continuesOnPages || [block.pageNum],
    month: block.month,
    year: block.year,
    payrollType: block.payrollType,
    ...extractBlockDataLocal(block.items, { sourcePage: block.pageNum, sourceRegion: block.blockIndex })
  }));
  return { blocks, rawPages, normalized: normalizePayrollResponse({ pages: rawPages }) };
}

const money = value => Number(String(value).replace(/\./g, '').replace(',', '.'));

test('holerite-1 preserva os 30 eventos e confere o inventário auditado bloco a bloco', async () => {
  const audit = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/payroll-01-block-audit.json'), 'utf8'));
  const { blocks, rawPages, normalized } = await auditedExtraction();
  assert.equal(blocks.length, 30);
  assert.equal(new Set(blocks.map(block => `${block.month}/${block.year}`)).size, 24);
  assert.equal(normalized.pages.length, 30);

  audit.forEach((expected, index) => {
    const block = blocks[index];
    const extraction = rawPages[index];
    assert.equal(block.recordKey, expected.k);
    assert.equal(`${block.month}/${block.year}`, expected.c);
    assert.equal(block.payrollType, expected.t);
    assert.deepEqual(block.continuesOnPages || [block.pageNum], expected.p);
    assert.equal(extraction.fields.length, expected.f, `${expected.k}: quantidade de verbas`);
    assert.equal(extraction.bases.length, expected.b, `${expected.k}: quantidade de bases`);
    assert.deepEqual(extraction.totals, { totalAdditions: expected.a, totalDeductions: expected.d, netValue: expected.n });
    if (expected.a !== null && expected.d !== null && expected.n !== null) {
      assert.ok(Math.abs(money(expected.a) - money(expected.d) - money(expected.n)) < 0.02, `${expected.k}: totais inconsistentes`);
    }
  });

  const typeCounts = Object.fromEntries(Object.entries(Object.groupBy(normalized.pages, page => page.payrollType)).map(([key, values]) => [key, values.length]));
  assert.deepEqual(typeCounts, { normal: 24, plr: 4, historico_13: 2 });
});

test('holerite-1 mantém referência, valor, natureza e zero na coluna correta', async () => {
  const { normalized } = await auditedExtraction();
  const april = normalized.pages.find(page => page.month === '04' && page.year === '2017' && page.payrollType === 'normal');
  const reimbursement = april.fields.find(field => field.code === '40');
  const inss = april.fields.find(field => field.code === '511');
  const irrf = april.fields.find(field => field.code === '561');
  assert.deepEqual(
    { reference: reimbursement.reference, value: reimbursement.value, type: reimbursement.type },
    { reference: '0,00', value: '360,00', type: 'provento' }
  );
  assert.deepEqual({ reference: inss.reference, value: inss.value, type: inss.type }, { reference: '0', value: '100,85', type: 'desconto' });
  assert.equal(irrf.value, '0,00');
  assert.equal(april.bases.find(base => base.canonicalKey === 'base:base_inss').value, '1.260,65');

  const july = normalized.pages.find(page => page.month === '07' && page.year === '2018' && page.payrollType === 'normal');
  assert.deepEqual(july.sourcePages, [3, 4]);
  assert.equal(july.bases.find(base => base.canonicalKey === 'base:valor_liquido').value, '1.394,74');
});

test('registro canônico limita o holerite-1 a 50 colunas e rejeita rótulo composto ambíguo', async () => {
  const { normalized } = await auditedExtraction();
  const registry = buildCanonicalColumnRegistry(normalized.pages);
  assert.equal(registry.fields.length, 40);
  assert.equal(registry.bases.length, 10);
  assert.equal(registry.fields.length + registry.bases.length, 50);

  const aliases = [
    canonicalizePayrollItem({ label: 'Base INSS', value: '1,00' }, 'base'),
    canonicalizePayrollItem({ label: 'Base de Calculo do INSS', value: '1,00' }, 'base')
  ];
  assert.equal(aliases[0].canonicalKey, aliases[1].canonicalKey);
  const ambiguous = canonicalizePayrollItem({ label: 'Base I.N.S.S. | F.G.T.S. do Mês', value: '100,00' }, 'base');
  assert.equal(ambiguous.canonicalKey, null);
  assert.equal(ambiguous.reviewRequired, true);
});
