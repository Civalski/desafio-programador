import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFExtract } from 'pdf.js-extract';
import { analyzePageDensity, selectExtractionStrategy } from '../src/utils/densityAnalyzer.js';
import { listInputDocuments } from '../src/utils/inputDocuments.js';
import path from 'node:path';

const pdfExtract = new PDFExtract();

test('Holerites de exemplo podem ser preparados para envio à OpenAI', async () => {
  const docs = listInputDocuments(path.resolve('exemplos')).categories.payroll;
  assert.equal(docs.length, 4);

  for (const doc of docs) {
    const data = await new Promise((resolve, reject) => {
      pdfExtract.extract(doc.fullPath, {}, (error, result) => error ? reject(error) : resolve(result));
    });
    assert.ok(data.pages.length > 0);
    for (const page of data.pages) {
      const strategy = selectExtractionStrategy(analyzePageDensity(page.content || []), false);
      assert.ok(['SINGLE_PASS', 'DUAL_PASS', 'VISION_SINGLE_PASS'].includes(strategy));
    }
  }
});
