import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { PDFExtract } from 'pdf.js-extract';
import { analyzePageDensity, selectExtractionStrategy } from '../src/utils/densityAnalyzer.js';
import { config } from '../src/config/env.js';

const pdfExtract = new PDFExtract();

test('Análise de Densidade - Funções Unitárias', () => {
  const mockSparseContent = [{ str: 'Recibo', y: 10 }];
  const densitySparse = analyzePageDensity(mockSparseContent);
  assert.equal(densitySparse.charCount, 6);
  assert.equal(densitySparse.elementCount, 1);
  assert.equal(selectExtractionStrategy(densitySparse, false), 'VISION_SINGLE_PASS');

  const mockDenseContent = Array(200).fill(0).map((_, i) => ({ str: `Linha de verba exemplo número ${i}`, y: i * 5 }));
  const densityDense = analyzePageDensity(mockDenseContent);
  assert.ok(densityDense.charCount > 1500);
  assert.equal(selectExtractionStrategy(densityDense, false), 'DUAL_PASS');
  assert.equal(selectExtractionStrategy(densityDense, true), 'FICHA_BLOCK');
});

test('Análise de Densidade em Documentos da Base (data_input)', async () => {
  const payrollDir = path.resolve(config.dataInputDir, 'payroll');
  if (!fs.existsSync(payrollDir)) {
    console.log('⚠️ Pasta de entrada payroll não encontrada, pulando teste em arquivos físicos.');
    return;
  }

  const files = fs.readdirSync(payrollDir).filter(f => f.endsWith('.pdf')).sort();
  assert.ok(files.length > 0, 'Deve haver ao menos 1 arquivo PDF em data_input/payroll');

  for (const file of files) {
    const filePath = path.join(payrollDir, file);
    const pdfRes = await new Promise(r => pdfExtract.extract(filePath, {}, (err, res) => r(res)));

    console.log(`\n📄 Avaliando Estratégia de Densidade para: ${file}`);
    pdfRes.pages.forEach((page, idx) => {
      const density = analyzePageDensity(page.content);
      const strategy = selectExtractionStrategy(density, false);
      console.log(`   Página ${idx + 1}: ${density.charCount} chars | ${density.elementCount} elementos | Estratégia: ${strategy}`);
      
      if (file.includes('payroll-04')) {
        assert.equal(strategy, 'VISION_SINGLE_PASS', `Página de ${file} com baixa densidade deve usar SINGLE_PASS`);
      }
    });
  }
});
