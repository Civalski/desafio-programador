import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  evaluateHoleriteComplexity, 
  findOptimalHorizontalCut, 
  splitRegionHorizontally 
} from '../src/utils/payslipSegmenter.js';
import { 
  mergeFields, 
  mergeBases, 
  mergeHorizontalExtractions 
} from '../src/utils/horizontalMerger.js';

test('1. Holerite Simples - Não deve acionar divisão horizontal', () => {
  const simpleItems = [
    { x: 20, y: 100, str: '010 Vencimento' },
    { x: 200, y: 100, str: '1.000,00' },
    { x: 20, y: 120, str: '500 Desconto INSS' },
    { x: 200, y: 120, str: '100,00' }
  ];

  const comp = evaluateHoleriteComplexity(simpleItems);
  assert.equal(comp.isComplex, false, 'Holerite com poucas colunas deve ser classificado como simples');
});

test('2. Holerite Complexo - Deve identificar alta densidade de colunas', () => {
  const complexItems = [
    { x: 10, y: 100, str: '010' },
    { x: 50, y: 100, str: 'Salário Base' },
    { x: 150, y: 100, str: '30,00' },
    { x: 200, y: 100, str: '2.500,00' },
    { x: 300, y: 100, str: '0,00' },
    { x: 380, y: 100, str: '250,00' },
    { x: 450, y: 100, str: 'Base FGTS' },
    { x: 520, y: 100, str: '2.500,00' }
  ];

  const comp = evaluateHoleriteComplexity(complexItems, { columnThreshold: 6 });
  assert.equal(comp.isComplex, true, 'Holerite com 8 colunas distintas deve ser classificado como complexo');
});

test('3. Ponto de Corte Inteligente - Não deve bisectar um texto ao meio', () => {
  const itemsWithColumnGap = [
    { x: 10, width: 80, str: '40 Reembolso VR' },    // 10 a 90
    { x: 100, width: 40, str: '0,00' },              // 100 a 140
    // Canaleta ampla entre 140 e 200
    { x: 200, width: 60, str: '360,00' },            // 200 a 260
    { x: 280, width: 80, str: 'Base INSS 2.000,00' } // 280 a 360
  ];

  const xCut = findOptimalHorizontalCut(itemsWithColumnGap, 10, 360);
  
  // O ponto de corte não pode cair dentro da bounding box do item de [200, 260] nem de [100, 140]
  assert.ok(
    xCut < 100 || (xCut > 140 && xCut < 200) || xCut > 260,
    `O ponto de corte (${xCut}) deve cair em um espaço vago (canaleta), não bisectando caixas de texto`
  );
});

test('4. Overlap & Merge Determinístico - Não deve duplicar verbas presentes em ambas as extrações', () => {
  const leftFields = [
    { code: '40', label: 'Reembolso VR', reference: '0,00', value: '' },
    { code: '91', label: 'Adicional Periculosidade', reference: '146,67', value: '' }
  ];

  const rightFields = [
    { code: '40', label: 'Reembolso VR', reference: '', value: '360,00' },
    { code: '91', label: 'Adicional Periculosidade', reference: '', value: '290,92' },
    { code: '511', label: 'INSS Normal', reference: '0,00', value: '100,85' }
  ];

  const merged = mergeFields(leftFields, rightFields);

  assert.equal(merged.length, 3, 'Deve conter 3 verbas únicas após o merge, sem duplicação de verbas em overlap');
  
  const vrVerba = merged.find(f => f.code === '40');
  assert.ok(vrVerba, 'Deve conter a verba 40');
  assert.equal(vrVerba.reference, '0,00', 'Deve preservar a referência obtida na esquerda');
  assert.equal(vrVerba.value, '360,00', 'Deve combinar o valor obtido na direita');
});

test('5. Preservação de Alinhamento entre Reference e Value', () => {
  const leftResult = {
    pages: [{
      page: 1,
      month: '04',
      year: '2017',
      fields: [{ code: '102', label: 'Hr Ext Diu 60%', reference: '8,48', value: '' }],
      bases: [{ label: 'Base INSS', value: '2.064,79' }]
    }]
  };

  const rightResult = {
    pages: [{
      page: 1,
      month: '04',
      year: '2017',
      fields: [{ code: '102', label: 'Hr Ext Diu 60%', reference: '', value: '116,66' }],
      bases: [{ label: 'Base FGTS', value: '2.064,79' }]
    }]
  };

  const mergedResult = mergeHorizontalExtractions(leftResult, rightResult);

  assert.ok(mergedResult.pages[0], 'Deve conter a página combinada');
  const field102 = mergedResult.pages[0].fields[0];
  assert.equal(field102.code, '102');
  assert.equal(field102.reference, '8,48', 'Reference (horas/quantidade) deve permanecer intacta');
  assert.equal(field102.value, '116,66', 'Value (monetário R$) deve ser atribuído corretamente');
  assert.equal(mergedResult.pages[0].bases.length, 2, 'Bases de ambas as regiões devem ser consolidadas sem duplicar');
});

test('6. Divisão Horizontal de Região com Overlap Integrado', () => {
  const region = {
    page: 1,
    index: 0,
    items: [
      { x: 10, y: 100, str: '040' },
      { x: 40, y: 100, str: 'Reembolso VR' },
      { x: 150, y: 100, str: '0,00' },
      { x: 250, y: 100, str: '360,00' },
      { x: 350, y: 100, str: '511' },
      { x: 400, y: 100, str: 'INSS' },
      { x: 500, y: 100, str: '100,85' }
    ]
  };

  const { leftRegion, rightRegion, xCut } = splitRegionHorizontally(region, { overlap: 30 });

  assert.ok(xCut > 10 && xCut < 500, 'xCut deve estar entre os limites horizontais do documento');
  assert.ok(leftRegion.items.length > 0, 'Região Esquerda deve conter itens');
  assert.ok(rightRegion.items.length > 0, 'Região Direita deve conter itens');
});
