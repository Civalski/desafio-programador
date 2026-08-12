import test from 'node:test';
import assert from 'node:assert';
import { exportToCsv, generateExport } from '../src/utils/exportUtils.js';

test('Exportação Holerite - Estrutura Pivotada por Descrição/Verba (CSV e XLSX)', async () => {
  const mockJob = {
    id: 'test-job-123',
    tipo: 'holerite',
    value: {
      pages: [
        {
          page: 1,
          month: '04',
          year: '2017',
          fields: [
            { code: '40', label: 'Reembolso VR', reference: '0,00', value: '360,00' },
            { code: '91', label: 'Hr Adic Pericul', reference: '146,67', value: '290,92' }
          ],
          bases: [
            { label: 'Base INSS', value: '2.630,79' },
            { label: 'Salário Líquido', value: '2.270,79' }
          ]
        }
      ]
    }
  };

  // 1. Valida exportação CSV
  const csvContent = exportToCsv(mockJob);
  assert.ok(csvContent.includes('"Página","Competência","Reembolso VR","Hr Adic Pericul","Base INSS","Salário Líquido"'));
  assert.ok(csvContent.includes('1,"04/2017","360,00","290,92","2.630,79","2.270,79"'));

  // 2. Valida exportação XLSX (Buffer retornado sem erros)
  const xlsxResult = await generateExport(mockJob, 'xlsx');
  assert.equal(xlsxResult.filename, 'transcricao_test-job-123_holerite.xlsx');
  assert.ok(xlsxResult.content instanceof Buffer);
  assert.ok(xlsxResult.content.length > 0);
});
