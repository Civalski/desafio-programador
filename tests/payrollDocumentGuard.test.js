import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfValidator } from '../src/infrastructure/pdf/pdfValidator.js';

const extractorWith = text => ({ extract(_path, _options, callback) { callback(null, { pages: [{ content: [{ str: text }] }] }); } });

test('barreira documental aceita folha de pagamento', async () => {
  const validator = new PdfValidator(extractorWith('Holerite Total Proventos Total Descontos Base INSS Salário Líquido'));
  assert.equal((await validator.assertPayrollDocument('/fake.pdf')).classification, 'payroll');
});

test('barreira documental rejeita cartão de ponto antes da transcrição', async () => {
  const validator = new PdfValidator(extractorWith('Espelho de Ponto Entrada Saída Jornada de Trabalho Banco de Horas'));
  await assert.rejects(() => validator.assertPayrollDocument('/fake.pdf'), error => error.code === 'DOCUMENT_NOT_PAYROLL' && /ponto/.test(error.message));
});

test('barreira documental rejeita PDF textual que não é folha de pagamento', async () => {
  const validator = new PdfValidator(extractorWith('Contrato de prestação de serviços e condições comerciais'));
  await assert.rejects(() => validator.assertPayrollDocument('/fake.pdf'), error => error.code === 'DOCUMENT_NOT_PAYROLL');
});
