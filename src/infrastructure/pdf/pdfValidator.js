import { PDFExtract } from 'pdf.js-extract';

export class PdfValidator {
  constructor(extractor = new PDFExtract()) { this.extractor = extractor; }
  async assertReadable(filePath) {
    return new Promise((resolve, reject) => this.extractor.extract(filePath, {}, (error, result) => error ? reject(error) : resolve(result)));
  }
  async assertPayrollDocument(filePath) {
    const result = await this.assertReadable(filePath);
    const text = (result?.pages || []).slice(0, 4).flatMap(page => page.content || []).map(item => item.str || '').join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!text.trim()) return { classification: 'scanned_unknown', textAvailable: false };
    const timecardSignals = [/cartao\s+de\s+ponto/, /espelho\s+de\s+ponto/, /registro\s+de\s+ponto/, /entrada\s+saida/, /batidas?/, /jornada\s+de\s+trabalho/, /banco\s+de\s+horas/].filter(pattern => pattern.test(text)).length;
    const payrollSignals = [/holerite/, /contracheque/, /demonstrativo\s+de\s+pagamento/, /ficha\s+financeira/, /total\s+(?:de\s+)?proventos/, /total\s+(?:de\s+)?descontos/, /salario\s+liquido/, /base\s+(?:de\s+calculo\s+)?inss/, /base\s+(?:de\s+calculo\s+)?fgts/].filter(pattern => pattern.test(text)).length;
    if (timecardSignals >= 1 && payrollSignals < 2) return this.rejectNonPayroll('cartão ou espelho de ponto não é aceito. Envie somente folha de pagamento.');
    if (payrollSignals < 2) return this.rejectNonPayroll('o PDF não apresenta evidências suficientes de folha de pagamento.');
    return { classification: 'payroll', textAvailable: true, payrollSignals };
  }
  rejectNonPayroll(message) {
    const error = new Error(`DOCUMENT_NOT_PAYROLL: ${message}`);
    error.code = 'DOCUMENT_NOT_PAYROLL';
    throw error;
  }
}
