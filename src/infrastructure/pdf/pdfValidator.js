import { PDFExtract } from 'pdf.js-extract';

export class PdfValidator {
  constructor() { this.extractor = new PDFExtract(); }
  async assertReadable(filePath) {
    await new Promise((resolve, reject) => this.extractor.extract(filePath, {}, error => error ? reject(error) : resolve()));
  }
}
