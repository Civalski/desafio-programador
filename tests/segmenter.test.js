import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import { segmentPagePayslips } from '../src/utils/payslipSegmenter.js';
import { config } from '../src/config/env.js';

const pdfExtract = new PDFExtract();

test('Segmentador de Holerites - Detecção de 6 holerites em payroll-01.pdf', async () => {
  const filePath = path.resolve(config.dataInputDir, 'holerite-1.pdf');
  const data = await pdfExtract.extract(filePath, {});
  
  assert.ok(data.pages.length >= 1, 'PDF deve ter páginas');
  const page1 = data.pages[0];
  
  const regions = segmentPagePayslips(page1.content, page1.pageInfo || { num: 1, height: 842 });

  assert.equal(regions.length, 6, 'Página 1 do payroll-01.pdf deve ser segmentada em exatamente 6 regiões de holerites');
  
  regions.forEach((reg, idx) => {
    assert.equal(reg.page, 1);
    assert.equal(reg.index, idx);
    assert.ok(reg.yStart < reg.yEnd, `yStart (${reg.yStart}) deve ser menor que yEnd (${reg.yEnd})`);
    assert.ok(reg.items.length > 0, `Região ${idx} deve conter itens de texto`);
  });

  // Valida que os intervalos das 6 regiões estão em ordem vertical estrita
  for (let i = 0; i < regions.length - 1; i++) {
    assert.ok(regions[i].yStart < regions[i + 1].yStart, `Região ${i} yStart deve anteceder região ${i + 1}`);
  }
});
test('Segmentador de Holerites - Detecção de 2 holerites com alturas diferentes em payroll-02.pdf', async () => {
  const filePath = path.resolve(config.dataInputDir, 'holerite-2.pdf');
  const data = await pdfExtract.extract(filePath, {});
  
  const page1 = data.pages[0];
  const regions = segmentPagePayslips(page1.content, page1.pageInfo || { num: 1, height: 842 });

  assert.equal(regions.length, 2, 'Página 1 do payroll-02.pdf deve ser segmentada em exatamente 2 regiões de holerites (MÊS e ACERTO)');
  assert.ok(regions[0].yEnd - regions[0].yStart > 100, 'Holerite 1 deve ter altura válida');
  assert.ok(regions[1].yEnd - regions[1].yStart > 100, 'Holerite 2 deve ter altura válida');
});

test('Segmentador de Holerites - Detecção de 1 holerite único em payroll-03.pdf', async () => {
  const filePath = path.resolve(config.dataInputDir, 'holerite-3.pdf');
  const data = await pdfExtract.extract(filePath, {});
  
  const page1 = data.pages[0];
  const regions = segmentPagePayslips(page1.content, page1.pageInfo || { num: 1, height: 842 });

  assert.equal(regions.length, 1, 'Página 1 do payroll-03.pdf deve conter 1 holerite');
  assert.equal(regions[0].index, 0);
});

test('Segmentador de Holerites - Resiliência e Fallback em PDF sem texto (payroll-04.pdf)', async () => {
  const filePath = path.resolve(config.dataInputDir, 'holerite-4.pdf');
  const data = await pdfExtract.extract(filePath, {});
  
  const page1 = data.pages[0];
  const regions = segmentPagePayslips(page1.content, page1.pageInfo || { num: 1, height: 842 });

  assert.ok(Array.isArray(regions), 'Retorno deve ser um Array');
  assert.equal(regions.length, 1, 'Deve retornar 1 região como fallback seguro');
  assert.equal(regions[0].isFallback, true, 'Deve indicar isFallback=true');
});

