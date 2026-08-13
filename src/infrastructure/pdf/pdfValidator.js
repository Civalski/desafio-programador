import { PDFExtract } from 'pdf.js-extract';

export class PdfValidator {
  constructor(extractor = new PDFExtract()) { this.extractor = extractor; }
  async assertReadable(filePath) {
    return new Promise((resolve, reject) => this.extractor.extract(filePath, {}, (error, result) => error ? reject(error) : resolve(result)));
  }
  async assertPayrollDocument(filePath) {
    const result = await this.assertReadable(filePath);
    const text = (result?.pages || []).slice(0, 4).flatMap(page => page.content || []).map(item => item.str || '').join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    if (!text.trim()) return { classification: 'scanned_unknown', textAvailable: false };

    const timecardSignals = [/cartao\s+de\s+ponto/, /espelho\s+de\s+ponto/, /registro\s+de\s+ponto/, /entrada\s+saida/, /batidas?/, /jornada\s+de\s+trabalho/, /banco\s+de\s+horas/].filter(pattern => pattern.test(text)).length;
    // Layouts de holerite variam: nomes de colunas e tributos também são evidências.
    const payrollSignals = [
      /holerite/, /contra\s*cheque/, /demonstrativo\s+de\s+(?:pagamento|remuneracao)/, /ficha\s+financeira/,
      /(?:total\s+(?:de\s+)?)?(?:proventos|vencimentos)/, /(?:total\s+(?:de\s+)?)?descontos/,
      /(?:salario\s+)?liquido(?:\s+a\s+(?:receber|pagar))?/, /liquido\s+a\s+(?:receber|pagar)/,
      /base\s+(?:de\s+calculo\s+)?(?:inss|fgts|irrf)/, /\b(?:inss|fgts|irrf)\b/,
      /codigo\s+(?:descricao|evento|rubrica)/, /(?:referencia|rubrica)\s+(?:vencimentos|proventos|descontos)/,
      /periodo\s+(?:de\s+)?(?:pagamento|competencia)/, /vale\s+(?:transporte|refeicao|alimentacao)/
    ].filter(pattern => pattern.test(text)).length;
    const payrollIdentity = /holerite|contra\s*cheque|demonstrativo\s+de\s+(?:pagamento|remuneracao)|ficha\s+financeira/.test(text);

    if (timecardSignals >= 1 && !payrollIdentity && payrollSignals < 2) return this.rejectNonPayroll('cartão ou espelho de ponto não é aceito. Envie somente folha de pagamento.');
    if (!payrollIdentity && payrollSignals < 2) return this.rejectNonPayroll('o PDF não apresenta evidências suficientes de folha de pagamento.');
    return { classification: 'payroll', textAvailable: true, payrollSignals };
  }
  rejectNonPayroll(message) {
    const error = new Error(`DOCUMENT_NOT_PAYROLL: ${message}`);
    error.code = 'DOCUMENT_NOT_PAYROLL';
    throw error;
  }
}
