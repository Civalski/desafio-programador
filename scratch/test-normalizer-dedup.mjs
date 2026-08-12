import { normalizePayrollResponse } from '../src/normalizers/payrollNormalizer.js';

// Simula extração com format do OpenAI (campos separados: fields, bases, totals)
const rawPages = [
  {
    page: 1, month: '05', year: '2024',
    fields: [
      { code: '001', label: 'Salário Base', reference: '220', value: '3.000,00', type: 'provento' },
      { code: '050', label: 'INSS', reference: '11%', value: '330,00', type: 'desconto' }
    ],
    bases: [{ label: 'Base INSS', value: '3.000,00' }],
    totals: { totalAdditions: '3.000,00', totalDeductions: '330,00', netValue: '2.670,00' }
  },
  {
    page: 2, month: '05', year: '2024',
    // Mesmo mês/ano — deve ser unificado com deduplição por similaridade
    fields: [
      { code: '001', label: 'SAL. BASE', reference: '220', value: '3.000,00', type: 'provento' },
      { code: '', label: 'Contribuição INSS', reference: '11%', value: '330,00', type: 'desconto' },
      { code: '060', label: 'Vale Transporte', reference: '22', value: '110,00', type: 'desconto' }
    ],
    bases: [{ label: 'Base INSS', value: '3.000,00' }, { label: 'Base FGTS', value: '3.000,00' }],
    totals: { totalAdditions: '3.000,00', totalDeductions: '440,00', netValue: '2.560,00' }
  },
  {
    page: 3, month: '06', year: '2024',
    fields: [
      { code: '001', label: 'Salário Base', reference: '220', value: '3.200,00', type: 'provento' },
      { code: '050', label: 'INSS', reference: '11%', value: '352,00', type: 'desconto' },
      { code: '060', label: 'Vale Transporte', reference: '22', value: '110,00', type: 'desconto' }
    ],
    bases: [{ label: 'Base INSS', value: '3.200,00' }, { label: 'Base FGTS', value: '3.200,00' }],
    totals: { totalAdditions: '3.200,00', totalDeductions: '462,00', netValue: '2.738,00' }
  }
];

const result = normalizePayrollResponse({ pages: rawPages });
console.log('=== RESULTADO DA NORMALIZAÇÃO COMPLETA ===');
console.log('Páginas unificadas:', result.pages.length, '(esperado: 2)');
result.pages.forEach(p => {
  console.log(`\n  Competência: ${p.month}/${p.year}`);
  console.log(`  Fields (${p.fields.length}):`);
  p.fields.forEach(f => console.log(`    [${f.code || 'S/N'}] ${f.label} [${f.type}] = R$ ${f.value}`));
  console.log(`  Bases (${p.bases.length}):`);
  p.bases.forEach(b => console.log(`    ${b.label}: R$ ${b.value}`));
});
console.log('\n=== AUDITORIA ===');
console.log('Status:', result.audit.status);
console.log('Competências:', result.audit.competencies);
console.log('Warnings:', result.audit.warnings);
